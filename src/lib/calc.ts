// Lógica de cálculo pura: sin React, sin DOM, sin localStorage.

export const MAX_VALUE = 1e9;

/** Si no es finito → 0. Clamp entre 0 y 1e9. */
export function sanitize(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > MAX_VALUE) return MAX_VALUE;
  return n;
}

export interface CostInputs {
  priceKg: number;
  priceKwh: number;
  consumptionW: number;
  machineLifespanHours: number;
  repairCosts: number;
  errorMarginPercent: number;
  hours: number;
  minutes: number;
  grams: number;
  insumos: number;
  profitMultiplier: number;
}

export interface CostResult {
  horas: number;
  material: number;
  luz: number;
  desgaste: number;
  error: number;
  costo: number;
  insumos: number;
  total: number;
  precioML: number;
}

/** Fórmula exacta (no cambiar). */
export function calculate(raw: CostInputs): CostResult {
  const priceKg = sanitize(raw.priceKg);
  const priceKwh = sanitize(raw.priceKwh);
  const consumptionW = sanitize(raw.consumptionW);
  const machineLifespanHours = sanitize(raw.machineLifespanHours);
  const repairCosts = sanitize(raw.repairCosts);
  const errorMarginPercent = sanitize(raw.errorMarginPercent);
  const hours = sanitize(raw.hours);
  const minutes = sanitize(raw.minutes);
  const grams = sanitize(raw.grams);
  const insumos = sanitize(raw.insumos);
  const profitMultiplier = sanitize(raw.profitMultiplier);

  const horas = hours + minutes / 60;
  const material = (grams / 1000) * priceKg;
  const luz = (consumptionW / 1000) * horas * priceKwh;
  const desgaste =
    (machineLifespanHours > 0 ? repairCosts / machineLifespanHours : 0) * horas;
  const error = (errorMarginPercent / 100) * (material + luz + desgaste);
  const costo = material + luz + desgaste + error;
  const insumosR = insumos * 1.3;
  const total = costo * profitMultiplier + insumosR;
  const precioML = costo * (profitMultiplier + 0.8) + insumosR;

  return { horas, material, luz, desgaste, error, costo, insumos: insumosR, total, precioML };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Símbolo + toLocaleString("es-AR", 2 decimales). Ej: "AR$ 21.742,97". */
export function formatMoney(value: number, symbol: string): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${symbol} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
