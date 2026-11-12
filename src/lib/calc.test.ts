import { describe, expect, it } from "vitest";
import { calculate, formatMoney, round2, sanitize, type CostInputs } from "./calc";
import { mergeById, normalizePiece, normalizeProfile, parseBackup } from "./model";

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
    ["precioML", r.precioML, 25807.76],
  ])("%s = %d", (_name, value, expected) => {
    expect(round2(value)).toBe(expected);
  });

  it("formatea en es-AR", () => {
    expect(formatMoney(r.total, "AR$")).toBe("AR$ 21.742,97");
    expect(formatMoney(r.precioML, "AR$")).toBe("AR$ 25.807,76");
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
