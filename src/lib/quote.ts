// Presupuesto para el cliente: modelo y cálculos puros (sin DOM ni jsPDF).
import { round2, sanitize } from "./calc";
import { CURRENCY_SYMBOLS, type Currency } from "./data";

export interface BusinessInfo {
  name: string;
  phone: string;
  email: string;
  instagram: string;
}

export interface QuoteLine {
  id: string;
  description: string;
  detail: string; // segunda línea en gris: material, medidas…
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  number: number;
  date: string; // ISO
  validDays: number;
  currency: Currency;
  business: BusinessInfo;
  clientName: string;
  clientContact: string;
  lines: QuoteLine[];
  notes: string;
}

export const DEFAULT_VALID_DAYS = 15;

export function lineSubtotal(l: QuoteLine): number {
  return round2(sanitize(l.quantity) * sanitize(l.unitPrice));
}

/** Líneas que van al PDF: con descripción o precio, y cantidad > 0. */
export function billableLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((l) => sanitize(l.quantity) > 0 && (l.description.trim() || sanitize(l.unitPrice) > 0));
}

export function quoteTotal(lines: QuoteLine[]): number {
  return round2(billableLines(lines).reduce((sum, l) => sum + lineSubtotal(l), 0));
}

/** Fecha de vencimiento (ISO) = fecha + días de validez. */
export function validUntil(dateISO: string, validDays: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + Math.floor(sanitize(validDays)));
  return d.toISOString();
}

export const formatQuoteNumber = (n: number) => String(Math.max(1, Math.floor(sanitize(n)))).padStart(4, "0");

/**
 * Símbolo para el PDF. Las fuentes estándar de jsPDF solo cubren Latin-1 (+ €),
 * así que si el símbolo tiene otro carácter (ej. ₲) se usa el código ISO.
 */
export function pdfCurrencySymbol(currency: Currency): string {
  const s = CURRENCY_SYMBOLS[currency];
  return /^[ -ÿ€]+$/.test(s) ? s : currency;
}

/** Nombre de archivo seguro: "presupuesto-0007-juan-perez.pdf". */
export function quoteFilename(q: Pick<Quote, "number" | "clientName">): string {
  const slug = q.clientName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `presupuesto-${formatQuoteNumber(q.number)}${slug ? `-${slug}` : ""}.pdf`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function normalizeBusiness(v: unknown): BusinessInfo {
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  if (!isObj(v)) return { name: "", phone: "", email: "", instagram: "" };
  return { name: s(v.name), phone: s(v.phone), email: s(v.email), instagram: s(v.instagram) };
}

/** Líneas de contacto del negocio para el encabezado del PDF. */
export function businessContactLines(b: BusinessInfo): string[] {
  const ig = b.instagram.trim().replace(/^@+/, "");
  return [
    b.phone.trim() && `Tel.: ${b.phone.trim()}`,
    b.email.trim(),
    ig && `Instagram: @${ig}`,
  ].filter(Boolean);
}
