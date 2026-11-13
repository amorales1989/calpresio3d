import type { CostResult, MLInputs } from "./calc";
import { precioMercadoLibre, sanitize } from "./calc";
import { CUSTOM_PRINTER, findPrinter, isCurrency, type Currency } from "./data";

export interface Profile extends MLInputs {
  id: string;
  name: string;
  currency: Currency;
  priceKg: number;
  priceKwh: number;
  printerModel: string; // id de PRINTER_MODELS o "custom"
  consumptionW: number;
  machineLifespanHours: number;
  repairCosts: number;
  errorMarginPercent: number;
}

export interface Piece {
  hours: number;
  minutes: number;
  grams: number;
  insumos: number;
  profitMultiplier: number;
}

export interface Product {
  id: string;
  name: string;
  material: string; // ej. "PLA negro"; se muestra al cliente en el presupuesto
  description: string; // detalle opcional para el cliente (medidas, terminación…)
  createdAt: string; // ISO
  piece: Piece;
  profile: Profile; // copia del perfil usado
  results: CostResult;
}

/** Datos del producto que se cargan o editan a mano. */
export type ProductInfo = Pick<Product, "name" | "material" | "description">;

/** Detalle que ve el cliente debajo del nombre: "Detalle · Material: PLA negro". */
export function productDetail(p: Pick<Product, "material" | "description">): string {
  return [p.description.trim(), p.material.trim() && `Material: ${p.material.trim()}`].filter(Boolean).join(" · ");
}

export interface BackupData {
  app: "calculadora-3d";
  version: 1;
  exportedAt: string;
  profiles: Profile[];
  products: Product[];
}

export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignorar */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultProfile(): Profile {
  return {
    id: "default",
    name: "Perfil por defecto",
    currency: "ARS",
    priceKg: 25000,
    priceKwh: 140,
    printerModel: CUSTOM_PRINTER,
    consumptionW: 120,
    machineLifespanHours: 4320,
    repairCosts: 150000,
    errorMarginPercent: 5,
    ...defaultML(),
  };
}

/** Valores de referencia de MercadoLibre Argentina (nov. 2026): ajustalos en el perfil. */
export function defaultML(): MLInputs {
  return { mlComisionPct: 14, mlCargoFijo: 1500, mlCargoFijoHasta: 33000, mlEnvio: 8000, mlIibbPct: 3 };
}

export function defaultPiece(): Piece {
  return { hours: 0, minutes: 0, grams: 0, insumos: 0, profitMultiplier: 3 };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const numOr = (v: unknown, fallback: number) => (v === undefined ? fallback : sanitize(v));
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

/** Normaliza un perfil desconocido (de localStorage o de un JSON importado). */
export function normalizeProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  const d = defaultProfile();
  const printerModel =
    typeof v.printerModel === "string" && (v.printerModel === CUSTOM_PRINTER || findPrinter(v.printerModel))
      ? v.printerModel
      : CUSTOM_PRINTER;
  return {
    id: str(v.id, newId()),
    name: str(v.name, "Perfil sin nombre"),
    currency: isCurrency(v.currency) ? v.currency : d.currency,
    priceKg: sanitize(v.priceKg),
    priceKwh: sanitize(v.priceKwh),
    printerModel,
    consumptionW: sanitize(v.consumptionW),
    machineLifespanHours: sanitize(v.machineLifespanHours),
    repairCosts: sanitize(v.repairCosts),
    errorMarginPercent: sanitize(v.errorMarginPercent),
    // Perfiles de antes no tienen estos campos: se completan con los valores de referencia
    mlComisionPct: numOr(v.mlComisionPct, d.mlComisionPct),
    mlCargoFijo: numOr(v.mlCargoFijo, d.mlCargoFijo),
    mlCargoFijoHasta: numOr(v.mlCargoFijoHasta, d.mlCargoFijoHasta),
    mlEnvio: numOr(v.mlEnvio, d.mlEnvio),
    mlIibbPct: numOr(v.mlIibbPct, d.mlIibbPct),
  };
}

export function normalizePiece(v: unknown): Piece {
  const d = defaultPiece();
  if (!isObj(v)) return d;
  return {
    hours: sanitize(v.hours),
    minutes: sanitize(v.minutes),
    grams: sanitize(v.grams),
    insumos: sanitize(v.insumos),
    profitMultiplier: v.profitMultiplier === undefined ? d.profitMultiplier : sanitize(v.profitMultiplier),
  };
}

const RESULT_KEYS: (keyof CostResult)[] = [
  "horas", "material", "luz", "desgaste", "error", "costo", "insumos", "total", "precioML",
];

export function normalizeProduct(v: unknown): Product | null {
  if (!isObj(v)) return null;
  const profile = normalizeProfile(v.profile);
  if (!profile) return null;
  const r = isObj(v.results) ? v.results : {};
  const results = Object.fromEntries(RESULT_KEYS.map((k) => [k, sanitize(r[k])])) as unknown as CostResult;
  // El precio ML se recalcula siempre con los costos ML del perfil (así los productos viejos usan la fórmula nueva)
  results.precioML = precioMercadoLibre(results.total, profile);
  const date = typeof v.createdAt === "string" && !Number.isNaN(Date.parse(v.createdAt)) ? v.createdAt : new Date().toISOString();
  return {
    id: str(v.id, newId()),
    name: str(v.name, "Producto sin nombre"),
    material: typeof v.material === "string" ? v.material : "",
    description: typeof v.description === "string" ? v.description : "",
    createdAt: date,
    piece: normalizePiece(v.piece),
    profile,
    results,
  };
}

/** Valida y normaliza un backup importado. Lanza Error con mensaje en castellano si no sirve. */
export function parseBackup(text: string): { profiles: Profile[]; products: Product[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (!isObj(data)) throw new Error("El archivo no tiene el formato esperado.");
  const rawProfiles = Array.isArray(data.profiles) ? data.profiles : [];
  const rawProducts = Array.isArray(data.products) ? data.products : [];
  if (!rawProfiles.length && !rawProducts.length) {
    throw new Error("El archivo no tiene perfiles ni productos.");
  }
  const profiles = rawProfiles.map(normalizeProfile).filter((x): x is Profile => x !== null);
  const products = rawProducts.map(normalizeProduct).filter((x): x is Product => x !== null);
  return { profiles, products };
}

/** Une listas por id: lo importado pisa lo existente con el mismo id. */
export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()];
}
