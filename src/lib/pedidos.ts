// Pedidos: modelo, estados y reglas puras (sin React, sin DOM, sin storage).
// Cuando exista el backend, el servidor aplica estas mismas reglas.
import type { CostResult } from "./calc";
import { round2, sanitize } from "./calc";
import { isCurrency, type Currency } from "./data";
import { normalizeItem, totalItems, resumenItems, type Item } from "./items";
import type { Piece, Profile } from "./model";

export const ESTADOS = [
  "pendiente",
  "en_cola",
  "imprimiendo",
  "post_procesado",
  "terminado",
  "entregado",
  "cancelado",
] as const;

export type Estado = (typeof ESTADOS)[number];

export const isEstado = (v: unknown): v is Estado => typeof v === "string" && (ESTADOS as readonly string[]).includes(v);

/** Estado que dispara el aviso por mail. */
export const ESTADO_AVISO: Estado = "terminado";

/** Estados que ya no requieren trabajo: no cuentan como "activos" ni pueden estar atrasados. */
export const ESTADOS_CERRADOS: readonly Estado[] = ["entregado", "cancelado"];

export const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_cola: "En cola",
  imprimiendo: "Imprimiendo",
  post_procesado: "Post-procesado",
  terminado: "Terminado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** Flujo normal: el botón "Avanzar" lleva al siguiente. Cancelado queda fuera del flujo. */
const FLUJO: Estado[] = ["pendiente", "en_cola", "imprimiendo", "post_procesado", "terminado", "entregado"];

export function siguienteEstado(e: Estado): Estado | null {
  const i = FLUJO.indexOf(e);
  return i >= 0 && i < FLUJO.length - 1 ? FLUJO[i + 1] : null;
}

export const esActivo = (e: Estado) => !ESTADOS_CERRADOS.includes(e);

export interface DatosCalculo {
  piece: Piece;
  profile: Profile;
  results: CostResult;
}

export type OrigenPedido =
  | { tipo: "calculadora" }
  | { tipo: "producto"; productoId: string; nombre: string }
  | { tipo: "manual" };

export type TipoEvento = "creado" | "estado" | "editado" | "aviso";

export interface PedidoEvento {
  id: string;
  fecha: string; // ISO
  tipo: TipoEvento;
  desde?: Estado;
  hasta?: Estado;
  detalle?: string;
}

export type PedidoItem = Item;

/** Lo que se carga en el formulario. */
export interface PedidoInput {
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono: string;
  /** Productos o ítems libres del pedido (al menos uno). */
  items: PedidoItem[];
  moneda: Currency;
  fechaEntrega: string; // "AAAA-MM-DD" o ""
  notas: string;
  notificarCliente: boolean;
}

export interface Pedido extends PedidoInput {
  id: string;
  numero: number;
  estado: Estado;
  creadoAt: string;
  actualizadoAt: string;
  terminadoAt: string | null;
  /** Primera vez que se avisó que estaba terminado (para no avisar dos veces). */
  avisoAt: string | null;
  origen: OrigenPedido;
  datosCalculo: DatosCalculo | null;
  historial: PedidoEvento[];
}

/** Resultado de pasar un pedido a "terminado": a quién se le avisa. */
export interface Aviso {
  destinatarios: { rol: "vos" | "cliente"; email: string }[];
  /** true mientras no haya servidor: el mail no sale de verdad. */
  simulado: boolean;
  /** Por qué no se avisa a nadie, si corresponde. */
  motivo?: string;
}

// ---------- helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

export const totalPedido = (p: Pick<PedidoInput, "items">) => totalItems(p.items);

/** "3 × Maceta, 2 × Llavero": para la lista, los mails y los diálogos. */
export const resumenPedido = (p: Pick<PedidoInput, "items">) => resumenItems(p.items);

export const MAX_ITEMS = 100;

export const formatNumeroPedido = (n: number) => `#${String(Math.max(1, Math.floor(sanitize(n)))).padStart(4, "0")}`;

export function emptyInput(moneda: Currency = "ARS"): PedidoInput {
  return {
    clienteNombre: "",
    clienteEmail: "",
    clienteTelefono: "",
    items: [],
    moneda,
    fechaEntrega: "",
    notas: "",
    notificarCliente: true,
  };
}

/** Errores del formulario por campo (vacío = válido). */
export function validarInput(i: PedidoInput): Partial<Record<keyof PedidoInput, string>> {
  const e: Partial<Record<keyof PedidoInput, string>> = {};
  if (!i.clienteNombre.trim()) e.clienteNombre = "Poné el nombre del cliente.";
  if (i.clienteEmail.trim() && !isEmail(i.clienteEmail)) e.clienteEmail = "El email no es válido.";
  const items = i.items.filter((x) => x.descripcion.trim() || sanitize(x.precioUnitario) > 0);
  if (!items.length) e.items = "Agregá al menos un producto o ítem.";
  else if (items.some((x) => !x.descripcion.trim())) e.items = "Hay un ítem sin descripción.";
  else if (items.some((x) => !Number.isInteger(x.cantidad) || x.cantidad < 1)) e.items = "Las cantidades tienen que ser 1 o más.";
  else if (items.length > MAX_ITEMS) e.items = `Máximo ${MAX_ITEMS} ítems por pedido.`;
  if (i.fechaEntrega && Number.isNaN(Date.parse(i.fechaEntrega))) e.fechaEntrega = "Fecha inválida.";
  return e;
}

/** Limpia espacios y normaliza números antes de guardar. */
export function limpiarInput(i: PedidoInput): PedidoInput {
  const email = i.clienteEmail.trim();
  return {
    clienteNombre: i.clienteNombre.trim(),
    clienteEmail: email,
    clienteTelefono: i.clienteTelefono.trim(),
    items: i.items
      .filter((x) => x.descripcion.trim())
      .map((x) => ({
        ...x,
        descripcion: x.descripcion.trim(),
        detalle: x.detalle.trim(),
        cantidad: Math.max(1, Math.floor(sanitize(x.cantidad))),
        precioUnitario: round2(sanitize(x.precioUnitario)),
      })),
    moneda: i.moneda,
    fechaEntrega: i.fechaEntrega,
    notas: i.notas.trim(),
    notificarCliente: !!email && i.notificarCliente,
  };
}

/** Fecha local "AAAA-MM-DD" (no UTC: a la noche en Argentina UTC ya es mañana). */
export function hoyISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type Urgencia = "atrasado" | "hoy" | "pronto" | null;

/** Urgencia según la fecha de entrega. Solo aplica a pedidos que todavía no están listos. */
export function urgencia(p: Pick<Pedido, "estado" | "fechaEntrega">, hoy = hoyISO()): Urgencia {
  if (!p.fechaEntrega || !esActivo(p.estado) || p.estado === "terminado") return null;
  if (p.fechaEntrega < hoy) return "atrasado";
  if (p.fechaEntrega === hoy) return "hoy";
  const dias = (Date.parse(p.fechaEntrega) - Date.parse(hoy)) / 86_400_000;
  return dias <= 2 ? "pronto" : null;
}

/** Activos primero; entre ellos, los que vencen antes (sin fecha al final); después los más nuevos. */
export function ordenarPedidos(list: Pedido[]): Pedido[] {
  return [...list].sort((a, b) => {
    const act = Number(esActivo(b.estado)) - Number(esActivo(a.estado));
    if (act) return act;
    const fa = a.fechaEntrega || "9999-99-99";
    const fb = b.fechaEntrega || "9999-99-99";
    if (esActivo(a.estado) && fa !== fb) return fa < fb ? -1 : 1;
    return b.numero - a.numero;
  });
}

export function contarPorEstado(list: Pedido[]): Record<Estado, number> {
  const out = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
  for (const p of list) out[p.estado]++;
  return out;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export type FiltroEstado = Estado | "activos" | "todos";

export function filtrarPedidos(list: Pedido[], filtro: FiltroEstado, query: string): Pedido[] {
  const q = normalizar(query.trim().replace(/^#0*/, ""));
  return list.filter((p) => {
    if (filtro === "activos" ? !esActivo(p.estado) : filtro !== "todos" && p.estado !== filtro) return false;
    if (!q) return true;
    const items = p.items.map((i) => i.descripcion).join(" ");
    return normalizar(`${p.numero} ${p.clienteNombre} ${items} ${p.clienteEmail} ${p.clienteTelefono}`).includes(q);
  });
}

// ---------- transiciones (las usa el repo local; el servidor hará lo mismo) ----------

export function crearPedido(
  input: PedidoInput,
  extra: { id: string; numero: number; eventoId: string; estado?: Estado; origen: OrigenPedido; datosCalculo: DatosCalculo | null },
  now = new Date().toISOString(),
): Pedido {
  const estado = extra.estado ?? "pendiente";
  return {
    ...limpiarInput(input),
    id: extra.id,
    numero: extra.numero,
    estado,
    creadoAt: now,
    actualizadoAt: now,
    terminadoAt: estado === "terminado" ? now : null,
    avisoAt: null,
    origen: extra.origen,
    datosCalculo: extra.datosCalculo,
    historial: [{ id: extra.eventoId, fecha: now, tipo: "creado", hasta: estado }],
  };
}

export function editarPedido(p: Pedido, input: PedidoInput, eventoId: string, now = new Date().toISOString()): Pedido {
  return {
    ...p,
    ...limpiarInput(input),
    actualizadoAt: now,
    historial: [...p.historial, { id: eventoId, fecha: now, tipo: "editado" }],
  };
}

/** Destinatarios del aviso de "terminado". `tuEmail` es el mail del negocio. */
export function destinatariosAviso(p: Pick<Pedido, "clienteEmail" | "notificarCliente">, tuEmail: string): Aviso["destinatarios"] {
  const out: Aviso["destinatarios"] = [];
  if (isEmail(tuEmail)) out.push({ rol: "vos", email: tuEmail.trim() });
  if (p.notificarCliente && isEmail(p.clienteEmail)) out.push({ rol: "cliente", email: p.clienteEmail.trim() });
  return out;
}

/**
 * Cambia el estado y registra el evento. Si pasa a "terminado" por primera vez,
 * devuelve el aviso a enviar (solo se avisa una vez; para repetir, usar "Reenviar aviso").
 */
export function cambiarEstado(
  p: Pedido,
  estado: Estado,
  opts: { eventoIds: [string, string]; tuEmail: string; simulado: boolean; nota?: string },
  now = new Date().toISOString(),
): { pedido: Pedido; aviso: Aviso | null } {
  if (estado === p.estado) return { pedido: p, aviso: null };
  const historial: PedidoEvento[] = [
    ...p.historial,
    { id: opts.eventoIds[0], fecha: now, tipo: "estado", desde: p.estado, hasta: estado, detalle: opts.nota?.trim() || undefined },
  ];
  const pedido: Pedido = {
    ...p,
    estado,
    actualizadoAt: now,
    terminadoAt: estado === "terminado" ? (p.terminadoAt ?? now) : p.terminadoAt,
    historial,
  };
  if (estado !== ESTADO_AVISO || p.avisoAt) return { pedido, aviso: null };
  return registrarAviso(pedido, opts.eventoIds[1], opts.tuEmail, opts.simulado, now);
}

/** Registra un aviso (primero o reenvío) en el historial. */
export function registrarAviso(
  p: Pedido,
  eventoId: string,
  tuEmail: string,
  simulado: boolean,
  now = new Date().toISOString(),
): { pedido: Pedido; aviso: Aviso } {
  const destinatarios = destinatariosAviso(p, tuEmail);
  const motivo = destinatarios.length
    ? undefined
    : "No hay a quién avisar: cargá tu email en los datos de la empresa o el del cliente.";
  const lista = destinatarios.map((d) => `${d.rol === "vos" ? "vos" : "cliente"} (${d.email})`).join(", ");
  const detalle = motivo ?? `${simulado ? "Simulado (sin servidor): " : ""}aviso de terminado a ${lista}`;
  return {
    pedido: {
      ...p,
      avisoAt: destinatarios.length ? (p.avisoAt ?? now) : p.avisoAt,
      historial: [...p.historial, { id: eventoId, fecha: now, tipo: "aviso", detalle }],
    },
    aviso: { destinatarios, simulado, motivo },
  };
}

// ---------- normalización (datos de localStorage o del servidor) ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const isoOr = (v: unknown, fallback: string | null) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);

function normalizeOrigen(v: unknown): OrigenPedido {
  if (isObj(v) && v.tipo === "producto" && typeof v.productoId === "string") {
    return { tipo: "producto", productoId: v.productoId, nombre: s(v.nombre) };
  }
  if (isObj(v) && v.tipo === "calculadora") return { tipo: "calculadora" };
  return { tipo: "manual" };
}

function normalizeEvento(v: unknown): PedidoEvento | null {
  if (!isObj(v) || typeof v.id !== "string") return null;
  const tipo = (["creado", "estado", "editado", "aviso"] as const).find((t) => t === v.tipo);
  const fecha = isoOr(v.fecha, null);
  if (!tipo || !fecha) return null;
  return {
    id: v.id,
    fecha,
    tipo,
    desde: isEstado(v.desde) ? v.desde : undefined,
    hasta: isEstado(v.hasta) ? v.hasta : undefined,
    detalle: typeof v.detalle === "string" && v.detalle ? v.detalle : undefined,
  };
}

/** Ítems del pedido. Los pedidos de antes tenían un solo producto (descripción, cantidad y precio sueltos). */
function normalizeItems(v: Record<string, unknown>, id: string, origen: OrigenPedido): PedidoItem[] {
  if (Array.isArray(v.items)) return v.items.map(normalizeItem).filter((x): x is PedidoItem => x !== null);
  const descripcion = s(v.descripcion);
  if (!descripcion && !sanitize(v.precioUnitario)) return [];
  return [
    {
      id: `${id}-1`,
      productoId: origen.tipo === "producto" ? origen.productoId : null,
      descripcion,
      detalle: "",
      cantidad: Math.max(1, Math.floor(sanitize(v.cantidad))),
      precioUnitario: round2(sanitize(v.precioUnitario)),
    },
  ];
}

export function normalizePedido(v: unknown): Pedido | null {
  if (!isObj(v) || typeof v.id !== "string" || !v.id) return null;
  const now = new Date().toISOString();
  const creadoAt = isoOr(v.creadoAt, now)!;
  const fecha = s(v.fechaEntrega);
  const origen = normalizeOrigen(v.origen);
  return {
    id: v.id,
    numero: Math.max(1, Math.floor(sanitize(v.numero))),
    clienteNombre: s(v.clienteNombre) || "Sin nombre",
    clienteEmail: s(v.clienteEmail),
    clienteTelefono: s(v.clienteTelefono),
    items: normalizeItems(v, v.id, origen),
    moneda: isCurrency(v.moneda) ? v.moneda : "ARS",
    fechaEntrega: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
    notas: s(v.notas),
    notificarCliente: v.notificarCliente === true,
    estado: isEstado(v.estado) ? v.estado : "pendiente",
    creadoAt,
    actualizadoAt: isoOr(v.actualizadoAt, creadoAt)!,
    terminadoAt: isoOr(v.terminadoAt, null),
    avisoAt: isoOr(v.avisoAt, null),
    origen,
    datosCalculo: isObj(v.datosCalculo) ? (v.datosCalculo as unknown as DatosCalculo) : null,
    historial: Array.isArray(v.historial)
      ? v.historial.map(normalizeEvento).filter((e): e is PedidoEvento => e !== null)
      : [],
  };
}
