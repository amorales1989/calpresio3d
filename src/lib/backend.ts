// Dónde se guardan los datos: en el navegador (localStorage) o en el servidor (API + PostgreSQL).
// La app solo conoce la interfaz Backend; cuál se usa se decide al compilar (VITE_API=1 → servidor).
import { normalizePedido, type Aviso, type Estado, type Pedido, type PedidoInput } from "./pedidos";
import { LocalPedidosRepo, type NuevoPedido, type PedidosRepo } from "./pedidosRepo";
import { defaultProfile, normalizeProduct, normalizeProfile, type Product, type Profile } from "./model";
import { normalizeBusiness, type BusinessInfo } from "./quote";
import { KEYS, readJSON, readString, writeJSON, writeString } from "./storage";

/** true en el build para Coolify: los datos van al servidor y hay que iniciar sesión. */
export const USA_SERVIDOR = import.meta.env.VITE_API === "1";

export interface InitialData {
  profiles: Profile[];
  products: Product[];
  business: BusinessInfo;
  quoteSeq: number;
}

export interface Backend {
  remote: boolean;
  /** false mientras los avisos por mail sean simulados. */
  mailReal: boolean;
  pedidos: PedidosRepo;
  /** Reciben la lista anterior y la nueva: el servidor solo recibe lo que cambió. */
  saveProfiles(prev: Profile[], next: Profile[]): Promise<void>;
  saveProducts(prev: Product[], next: Product[]): Promise<void>;
  saveBusiness(b: BusinessInfo): Promise<void>;
  saveQuoteSeq(n: number): Promise<void>;
}

/** Qué documentos se crearon/cambiaron y cuáles se borraron entre dos listas. */
export function diffById<T extends { id: string }>(prev: T[], next: T[]): { upserts: T[]; deletes: string[] } {
  const before = new Map(prev.map((x) => [x.id, x]));
  const ids = new Set(next.map((x) => x.id));
  return {
    upserts: next.filter((x) => {
      const old = before.get(x.id);
      return old !== x && JSON.stringify(old) !== JSON.stringify(x);
    }),
    deletes: prev.filter((x) => !ids.has(x.id)).map((x) => x.id),
  };
}

// ---------- en el navegador ----------

const STORAGE_ERROR = "No se pudo guardar en este navegador (¿modo privado o almacenamiento lleno?).";

function write(key: string, value: unknown) {
  if (!writeJSON(key, value)) throw new Error(STORAGE_ERROR);
}

/** Lo que haya guardado en este navegador (también sirve para subirlo al servidor la primera vez). */
export function loadLocalData(): InitialData & { pedidos: Pedido[] } {
  const list = <T,>(key: string, norm: (v: unknown) => T | null) => {
    const raw = readJSON<unknown>(key, null);
    return Array.isArray(raw) ? raw.map(norm).filter((x): x is T => x !== null) : [];
  };
  return {
    profiles: list(KEYS.profiles, normalizeProfile),
    products: list(KEYS.products, normalizeProduct),
    business: normalizeBusiness(readJSON<unknown>(KEYS.business, null)),
    quoteSeq: Math.max(1, Math.floor(Number(readString(KEYS.quoteSeq)) || 1)),
    pedidos: list(KEYS.pedidos, normalizePedido),
  };
}

export function createLocalBackend(): Backend {
  return {
    remote: false,
    mailReal: false,
    pedidos: new LocalPedidosRepo(() => normalizeBusiness(readJSON<unknown>(KEYS.business, null)).email.trim()),
    saveProfiles: async (_prev, next) => write(KEYS.profiles, next),
    saveProducts: async (_prev, next) => write(KEYS.products, next),
    saveBusiness: async (b) => write(KEYS.business, b),
    saveQuoteSeq: async (n) => {
      if (!writeString(KEYS.quoteSeq, String(n))) throw new Error(STORAGE_ERROR);
    },
  };
}

// ---------- en el servidor ----------

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Se llama cuando el servidor contesta 401 (la sesión venció): la app vuelve al login. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.");
  }
  const data = (res.headers.get("content-type") ?? "").includes("json") ? await res.json().catch(() => null) : null;
  if (res.status === 401 && path !== "/login") onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Error del servidor (${res.status}).`);
  return data as T;
}

export interface RemoteData extends InitialData {
  pedidos: unknown[];
  mail: boolean;
}

export async function loadRemoteData(): Promise<RemoteData> {
  const d = await api<RemoteData>("GET", "/data");
  return {
    ...d,
    profiles: d.profiles.map(normalizeProfile).filter((p): p is Profile => p !== null),
    products: d.products.map(normalizeProduct).filter((p): p is Product => p !== null),
    business: normalizeBusiness(d.business),
  };
}

class ApiPedidosRepo implements PedidosRepo {
  constructor(readonly local: boolean) {}

  private static one(v: unknown): Pedido {
    const p = normalizePedido(v);
    if (!p) throw new Error("El servidor devolvió un pedido inválido.");
    return p;
  }

  async list() {
    return (await api<unknown[]>("GET", "/pedidos")).map((v) => ApiPedidosRepo.one(v));
  }
  async create(n: NuevoPedido) {
    return ApiPedidosRepo.one(await api("POST", "/pedidos", n));
  }
  async update(id: string, input: PedidoInput) {
    return ApiPedidosRepo.one(await api("PUT", `/pedidos/${encodeURIComponent(id)}`, { input }));
  }
  async setEstado(id: string, estado: Estado, nota?: string) {
    const r = await api<{ pedido: unknown; aviso: Aviso | null }>("POST", `/pedidos/${encodeURIComponent(id)}/estado`, { estado, nota });
    return { pedido: ApiPedidosRepo.one(r.pedido), aviso: r.aviso };
  }
  async reenviarAviso(id: string) {
    const r = await api<{ pedido: unknown; aviso: Aviso }>("POST", `/pedidos/${encodeURIComponent(id)}/aviso`, {});
    return { pedido: ApiPedidosRepo.one(r.pedido), aviso: r.aviso };
  }
  async remove(id: string) {
    await api("DELETE", `/pedidos/${encodeURIComponent(id)}`);
  }
}

async function syncCollection<T extends { id: string }>(name: "profiles" | "products", prev: T[], next: T[]) {
  const { upserts, deletes } = diffById(prev, next);
  await Promise.all([
    ...upserts.map((x) => api("PUT", `/${name}/${encodeURIComponent(x.id)}`, x)),
    ...deletes.map((id) => api("DELETE", `/${name}/${encodeURIComponent(id)}`)),
  ]);
}

export function createRemoteBackend(mail: boolean): Backend {
  return {
    remote: true,
    mailReal: mail,
    pedidos: new ApiPedidosRepo(!mail),
    saveProfiles: (prev, next) => syncCollection("profiles", prev, next),
    saveProducts: (prev, next) => syncCollection("products", prev, next),
    saveBusiness: async (b) => void (await api("PUT", "/settings/business", b)),
    saveQuoteSeq: async (n) => void (await api("PUT", "/settings/quoteSeq", { value: n })),
  };
}

/** Perfiles con los que arranca la app: si no hay ninguno, el de por defecto. */
export const startingProfiles = (list: Profile[]) => (list.length ? list : [defaultProfile()]);
