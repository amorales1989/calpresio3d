// Ítems de un pedido o presupuesto: productos guardados (precio fijo) o ítems libres (envío, diseño…).
import { round2, sanitize } from "./calc";
import { newId, productDetail, type Product } from "./model";

export interface Item {
  id: string;
  /** Producto guardado del que sale el ítem; null = ítem libre (se edita entero). */
  productoId: string | null;
  descripcion: string;
  detalle: string; // segunda línea para el cliente: material, medidas…
  cantidad: number;
  precioUnitario: number;
}

export const subtotalItem = (i: Pick<Item, "cantidad" | "precioUnitario">) =>
  round2(sanitize(i.cantidad) * sanitize(i.precioUnitario));

export const totalItems = (items: Pick<Item, "cantidad" | "precioUnitario">[]) =>
  round2(items.reduce((sum, i) => sum + subtotalItem(i), 0));

export const precioProducto = (p: Product) => round2(p.results.total);

export function itemDesdeProducto(p: Product, cantidad = 1): Item {
  return {
    id: newId(),
    productoId: p.id,
    descripcion: p.name,
    detalle: productDetail(p),
    cantidad,
    precioUnitario: precioProducto(p),
  };
}

export function itemLibre(over: Partial<Item> = {}): Item {
  return { id: newId(), productoId: null, descripcion: "", detalle: "", cantidad: 1, precioUnitario: 0, ...over };
}

/** Agrega un producto; si ya estaba en la lista, le suma 1 a la cantidad. */
export function agregarProducto(items: Item[], p: Product): Item[] {
  const i = items.findIndex((x) => x.productoId === p.id);
  if (i < 0) return [...items, itemDesdeProducto(p)];
  return items.map((x, j) => (j === i ? { ...x, cantidad: Math.floor(sanitize(x.cantidad)) + 1 } : x));
}

/** "Maceta" · "3 × Maceta" · "3 × Maceta, 2 × Llavero". */
export function resumenItems(items: Pick<Item, "cantidad" | "descripcion">[]): string {
  const conTexto = items.filter((i) => i.descripcion.trim());
  if (!conTexto.length) return "Sin ítems";
  return conTexto.map((i) => (i.cantidad > 1 ? `${i.cantidad} × ${i.descripcion.trim()}` : i.descripcion.trim())).join(", ");
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const s = (v: unknown) => (typeof v === "string" ? v : "");

export function normalizeItem(v: unknown): Item | null {
  if (!isObj(v)) return null;
  return {
    id: typeof v.id === "string" && v.id ? v.id : newId(),
    productoId: typeof v.productoId === "string" && v.productoId ? v.productoId : null,
    descripcion: s(v.descripcion),
    detalle: s(v.detalle),
    cantidad: Math.max(1, Math.floor(sanitize(v.cantidad))),
    precioUnitario: round2(sanitize(v.precioUnitario)),
  };
}
