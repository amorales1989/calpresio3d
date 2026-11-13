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

/** Costos de vender por MercadoLibre (se cargan en el perfil). */
export interface MLInputs {
  /** Comisión de la publicación, sin IVA (Clásica ~12-15 %, Premium ~17-20 %). */
  mlComisionPct: number;
  /** Cargo fijo por unidad, sin IVA. */
  mlCargoFijo: number;
  /** Desde este precio ML no cobra cargo fijo. */
  mlCargoFijoHasta: number;
  /** Envío que pagás vos por venta. */
  mlEnvio: number;
  /** Retención de Ingresos Brutos de Mercado Pago. */
  mlIibbPct: number;
}

/** IVA que ML suma a la comisión y al cargo fijo (para un monotributista es costo). */
export const IVA_ML = 0.21;

export interface DesgloseML {
  precio: number;
  comision: number; // con IVA
  cargoFijo: number; // con IVA
  envio: number;
  iibb: number;
  /** Lo que te queda: igual al precio normal. */
  neto: number;
}

/**
 * Precio a publicar en ML para que, después de comisión, cargo fijo, envío e IIBB,
 * te quede lo mismo que vendiendo directo (`neto`). Se divide porque la comisión y
 * la retención se calculan sobre el precio final.
 */
export function precioMercadoLibre(neto: number, raw: MLInputs): number {
  const n = sanitize(neto);
  if (n <= 0) return 0;
  const ml = sanitizeML(raw);
  const tasa = (ml.mlComisionPct / 100) * (1 + IVA_ML) + ml.mlIibbPct / 100;
  const divisor = Math.max(0.05, 1 - tasa);
  const sinCargo = (n + ml.mlEnvio) / divisor;
  if (ml.mlCargoFijo <= 0 || sinCargo >= ml.mlCargoFijoHasta) return sinCargo;
  const conCargo = (n + ml.mlEnvio + ml.mlCargoFijo * (1 + IVA_ML)) / divisor;
  // Si con el cargo fijo se pasa del umbral, alcanza con publicar al umbral (ahí ya no hay cargo fijo)
  return ml.mlCargoFijoHasta > 0 ? Math.min(conCargo, ml.mlCargoFijoHasta) : conCargo;
}

/** En qué se va cada parte del precio publicado en ML. */
export function desgloseML(precio: number, raw: MLInputs): DesgloseML {
  const p = sanitize(precio);
  const ml = sanitizeML(raw);
  const comision = p * (ml.mlComisionPct / 100) * (1 + IVA_ML);
  const cargoFijo = p > 0 && p < ml.mlCargoFijoHasta ? ml.mlCargoFijo * (1 + IVA_ML) : 0;
  const envio = p > 0 ? ml.mlEnvio : 0;
  const iibb = p * (ml.mlIibbPct / 100);
  return { precio: p, comision, cargoFijo, envio, iibb, neto: p - comision - cargoFijo - envio - iibb };
}

function sanitizeML(ml: MLInputs): MLInputs {
  return {
    mlComisionPct: Math.min(90, sanitize(ml.mlComisionPct)),
    mlCargoFijo: sanitize(ml.mlCargoFijo),
    mlCargoFijoHasta: sanitize(ml.mlCargoFijoHasta),
    mlEnvio: sanitize(ml.mlEnvio),
    mlIibbPct: Math.min(90, sanitize(ml.mlIibbPct)),
  };
}

export interface CostInputs extends MLInputs {
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

/** Fórmula exacta del costo y el total (no cambiar). El precio ML sale de precioMercadoLibre. */
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
  const precioML = precioMercadoLibre(total, raw);

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
