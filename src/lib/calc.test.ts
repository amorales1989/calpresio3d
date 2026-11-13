import { describe, expect, it } from "vitest";
import { calculate, desgloseML, formatMoney, precioMercadoLibre, round2, sanitize, type CostInputs } from "./calc";
import { defaultML, mergeById, normalizePiece, normalizeProduct, normalizeProfile, parseBackup } from "./model";

const base: CostInputs = {
  priceKg: 25000,
  priceKwh: 450,
  consumptionW: 120,
  machineLifespanHours: 4320,
  repairCosts: 150000,
  errorMarginPercent: 5,
  hours: 4,
  minutes: 40,
  grams: 177,
  insumos: 5000,
  profitMultiplier: 3,
  ...defaultML(), // comisión 14 % + IVA, cargo fijo 1500 hasta 33000, envío 8000, IIBB 3 %
};

describe("calculate — test obligatorio", () => {
  const r = calculate(base);
  it.each([
    ["material", r.material, 4425.0],
    ["luz", r.luz, 252.0],
    ["desgaste", r.desgaste, 162.04],
    ["error", r.error, 241.95],
    ["costo", r.costo, 5080.99],
    ["insumos", r.insumos, 6500.0],
    ["total", r.total, 21742.97],
    // (21742.97 + 8000) / (1 − 0.14 × 1.21 − 0.03) = 37150.85 → ya pasa los 33000: sin cargo fijo
    ["precioML", r.precioML, 37150.85],
  ])("%s = %d", (_name, value, expected) => {
    expect(round2(value)).toBe(expected);
  });

  it("formatea en es-AR", () => {
    expect(formatMoney(r.total, "AR$")).toBe("AR$ 21.742,97");
    expect(formatMoney(r.precioML, "AR$")).toBe("AR$ 37.150,85");
  });
});

describe("precio MercadoLibre", () => {
  const ml = defaultML();

  it("después de comisión, cargo fijo, envío e IIBB te queda lo mismo que vendiendo directo", () => {
    for (const neto of [3000, 15000, 21742.97, 60000]) {
      const precio = precioMercadoLibre(neto, ml);
      expect(round2(desgloseML(precio, ml).neto)).toBeGreaterThanOrEqual(round2(neto));
    }
  });

  it("suma el cargo fijo con IVA solo por debajo del umbral", () => {
    // (15000 + 8000 + 1500 × 1.21) / 0.8006 = 30995.50
    expect(round2(precioMercadoLibre(15000, ml))).toBe(30995.5);
    expect(round2(desgloseML(30995.5, ml).neto)).toBe(15000);
  });

  it("si el cargo fijo lo haría pasar del umbral, publica al umbral (ahí no hay cargo fijo)", () => {
    // sin cargo queda apenas debajo de 33000; con el cargo fijo se pasaría
    const neto = 33000 * 0.8006 - 8000 - 1;
    expect(precioMercadoLibre(neto, ml)).toBe(33000);
  });

  it("precio normal 0 → precio ML 0", () => {
    expect(precioMercadoLibre(0, ml)).toBe(0);
  });

  it("los productos viejos recalculan el precio ML con la fórmula nueva", () => {
    const p = normalizeProduct({ id: "x", name: "Vieja", profile: { name: "P" }, results: { total: 15000, precioML: 18000 } })!;
    expect(p.profile).toMatchObject(ml);
    expect(round2(p.results.precioML)).toBe(30995.5);
  });
});

describe("calculate — bordes", () => {
  it("vida útil 0 → desgaste 0 (sin dividir por cero)", () => {
    const r = calculate({ ...base, machineLifespanHours: 0 });
    expect(r.desgaste).toBe(0);
    expect(Number.isFinite(r.total)).toBe(true);
  });

  it("todo en cero da cero", () => {
    const zero = Object.fromEntries(Object.keys(base).map((k) => [k, 0])) as unknown as CostInputs;
    const r = calculate(zero);
    expect(r.total).toBe(0);
    expect(r.precioML).toBe(0);
  });

  it("NaN, Infinity y negativos se sanitizan a 0", () => {
    const r = calculate({ ...base, grams: NaN, priceKwh: Infinity, insumos: -500 });
    expect(r.material).toBe(0);
    expect(r.luz).toBe(0);
    expect(r.insumos).toBe(0);
  });

  it("solo minutos cuenta como fracción de hora", () => {
    const r = calculate({ ...base, hours: 0, minutes: 30 });
    expect(r.horas).toBe(0.5);
  });
});

describe("sanitize", () => {
  it("clampa entre 0 y 1e9", () => {
    expect(sanitize(-1)).toBe(0);
    expect(sanitize(5e12)).toBe(1e9);
    expect(sanitize("12.5")).toBe(12.5);
    expect(sanitize("")).toBe(0);
    expect(sanitize(undefined)).toBe(0);
    expect(sanitize(null)).toBe(0);
  });
});

describe("modelo / import", () => {
  it("normalizeProfile corrige moneda e impresora inválidas", () => {
    const p = normalizeProfile({ id: "x", name: "Mía", currency: "BTC", printerModel: "nope", priceKg: -3 });
    expect(p?.currency).toBe("ARS");
    expect(p?.printerModel).toBe("custom");
    expect(p?.priceKg).toBe(0);
  });

  it("normalizePiece usa ×3 por defecto", () => {
    expect(normalizePiece({}).profitMultiplier).toBe(3);
  });

  it("parseBackup rechaza JSON roto o vacío", () => {
    expect(() => parseBackup("{no")).toThrow();
    expect(() => parseBackup("{}")).toThrow();
  });

  it("mergeById pisa por id", () => {
    const out = mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "a", v: 2 }]);
    expect(out).toEqual([{ id: "a", v: 2 }, { id: "b", v: 1 }]);
  });
});
