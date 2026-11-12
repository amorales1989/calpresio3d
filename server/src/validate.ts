// Validación de los datos que llegan del front. Devuelve datos limpios o lanza ValidationError.
import { isEstado, type Estado } from "./estados.js";

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const CURRENCIES = ["ARS", "USD", "EUR", "MXN", "COP", "CLP", "PEN", "UYU", "DOP", "PYG"] as const;
const MAX_MONEY = 1e9;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PedidoInput {
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  descripcion: string;
  cantidad: number;
  precioTotal: number;
  moneda: string;
  fechaEntrega: string | null;
  notas: string | null;
  notificarCliente: boolean;
  estado: Estado;
  datosCalculo: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, field: string, max: number, required: boolean): string | null {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    if (required) throw new ValidationError(`Falta ${field}.`, field);
    return null;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} tiene que ser texto.`, field);
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`${field} supera los ${max} caracteres.`, field);
  return s;
}

function num(v: unknown, field: string, min: number, max: number, integer = false): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new ValidationError(`${field} no es un número válido.`, field);
  }
  return integer ? n : Math.round(n * 100) / 100;
}

function email(v: unknown): string | null {
  const s = text(v, "clienteEmail", 254, false);
  if (s && !EMAIL_RE.test(s)) throw new ValidationError("El email del cliente no es válido.", "clienteEmail");
  return s;
}

function date(v: unknown): string | null {
  const s = text(v, "fechaEntrega", 10, false);
  if (s && (!DATE_RE.test(s) || Number.isNaN(Date.parse(s)))) {
    throw new ValidationError("La fecha de entrega no es válida (AAAA-MM-DD).", "fechaEntrega");
  }
  return s;
}

function datos(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) throw new ValidationError("datosCalculo tiene que ser un objeto.", "datosCalculo");
  if (JSON.stringify(v).length > 20_000) throw new ValidationError("datosCalculo es demasiado grande.", "datosCalculo");
  return v;
}

function estado(v: unknown, fallback: Estado): Estado {
  if (v === undefined || v === null) return fallback;
  if (!isEstado(v)) throw new ValidationError("Estado inválido.", "estado");
  return v;
}

function moneda(v: unknown): string {
  const s = text(v, "moneda", 3, false) ?? "ARS";
  if (!(CURRENCIES as readonly string[]).includes(s)) throw new ValidationError("Moneda inválida.", "moneda");
  return s;
}

/** Alta de un pedido. */
export function parseNuevoPedido(body: unknown): PedidoInput {
  if (!isObj(body)) throw new ValidationError("El cuerpo tiene que ser un objeto JSON.");
  const clienteEmail = email(body.clienteEmail);
  return {
    clienteNombre: text(body.clienteNombre, "clienteNombre", 120, true)!,
    clienteEmail,
    clienteTelefono: text(body.clienteTelefono, "clienteTelefono", 40, false),
    descripcion: text(body.descripcion, "descripcion", 500, true)!,
    cantidad: body.cantidad === undefined ? 1 : num(body.cantidad, "cantidad", 1, 100_000, true),
    precioTotal: body.precioTotal === undefined ? 0 : num(body.precioTotal, "precioTotal", 0, MAX_MONEY),
    moneda: moneda(body.moneda),
    fechaEntrega: date(body.fechaEntrega),
    notas: text(body.notas, "notas", 2000, false),
    notificarCliente: body.notificarCliente === undefined ? !!clienteEmail : body.notificarCliente === true,
    estado: estado(body.estado, "pendiente"),
    datosCalculo: datos(body.datosCalculo),
  };
}

export type PedidoPatch = Partial<Omit<PedidoInput, "estado">>;

/** Edición parcial: solo los campos presentes. El estado se cambia por su propio endpoint. */
export function parsePatchPedido(body: unknown): PedidoPatch {
  if (!isObj(body)) throw new ValidationError("El cuerpo tiene que ser un objeto JSON.");
  if ("estado" in body) throw new ValidationError("Para cambiar el estado usá PATCH /pedidos/:id/estado.", "estado");
  const out: PedidoPatch = {};
  if ("clienteNombre" in body) out.clienteNombre = text(body.clienteNombre, "clienteNombre", 120, true)!;
  if ("clienteEmail" in body) out.clienteEmail = email(body.clienteEmail);
  if ("clienteTelefono" in body) out.clienteTelefono = text(body.clienteTelefono, "clienteTelefono", 40, false);
  if ("descripcion" in body) out.descripcion = text(body.descripcion, "descripcion", 500, true)!;
  if ("cantidad" in body) out.cantidad = num(body.cantidad, "cantidad", 1, 100_000, true);
  if ("precioTotal" in body) out.precioTotal = num(body.precioTotal, "precioTotal", 0, MAX_MONEY);
  if ("moneda" in body) out.moneda = moneda(body.moneda);
  if ("fechaEntrega" in body) out.fechaEntrega = date(body.fechaEntrega);
  if ("notas" in body) out.notas = text(body.notas, "notas", 2000, false);
  if ("notificarCliente" in body) out.notificarCliente = body.notificarCliente === true;
  if ("datosCalculo" in body) out.datosCalculo = datos(body.datosCalculo);
  if (!Object.keys(out).length) throw new ValidationError("No hay nada para actualizar.");
  return out;
}

export function parseCambioEstado(body: unknown): { estado: Estado; nota: string | null } {
  if (!isObj(body)) throw new ValidationError("El cuerpo tiene que ser un objeto JSON.");
  if (!isEstado(body.estado)) throw new ValidationError("Estado inválido.", "estado");
  return { estado: body.estado, nota: text(body.nota, "nota", 500, false) };
}

export function parseId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 2_147_483_647) throw new ValidationError("Id de pedido inválido.");
  return n;
}
