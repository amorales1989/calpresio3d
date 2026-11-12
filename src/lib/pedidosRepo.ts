// Acceso a los pedidos guardados en el navegador. La versión con servidor está en backend.ts.
// La UI solo conoce esta interfaz, así que cambiar de uno a otro no toca los componentes.
import { newId } from "./model";
import {
  cambiarEstado as aplicarCambioEstado,
  crearPedido,
  editarPedido,
  normalizePedido,
  registrarAviso,
  type Aviso,
  type DatosCalculo,
  type Estado,
  type OrigenPedido,
  type Pedido,
  type PedidoInput,
} from "./pedidos";
import { KEYS, readJSON, readString, writeJSON, writeString } from "./storage";

export interface NuevoPedido {
  input: PedidoInput;
  estado?: Estado;
  origen: OrigenPedido;
  datosCalculo: DatosCalculo | null;
}

export interface PedidosRepo {
  /** true mientras los avisos por mail sean simulados (sin servidor). */
  readonly local: boolean;
  list(): Promise<Pedido[]>;
  create(nuevo: NuevoPedido): Promise<Pedido>;
  update(id: string, input: PedidoInput): Promise<Pedido>;
  setEstado(id: string, estado: Estado, nota?: string): Promise<{ pedido: Pedido; aviso: Aviso | null }>;
  reenviarAviso(id: string): Promise<{ pedido: Pedido; aviso: Aviso }>;
  remove(id: string): Promise<void>;
}

/**
 * Repo en el navegador. `tuEmail` se lee en cada aviso (es el email de los datos
 * de la empresa, el mismo que va en el presupuesto PDF).
 */
export class LocalPedidosRepo implements PedidosRepo {
  readonly local = true;

  constructor(private readonly tuEmail: () => string) {}

  private read(): Pedido[] {
    const raw = readJSON<unknown>(KEYS.pedidos, null);
    return Array.isArray(raw) ? raw.map(normalizePedido).filter((p): p is Pedido => p !== null) : [];
  }

  private write(list: Pedido[]) {
    if (!writeJSON(KEYS.pedidos, list)) {
      throw new Error("No se pudo guardar en este navegador (¿modo privado o almacenamiento lleno?).");
    }
  }

  private nextNumero(list: Pedido[]): number {
    const seq = Math.floor(Number(readString(KEYS.pedidoSeq)) || 0);
    const max = list.reduce((m, p) => Math.max(m, p.numero), 0);
    return Math.max(seq, max) + 1;
  }

  private replace(list: Pedido[], p: Pedido) {
    this.write(list.map((x) => (x.id === p.id ? p : x)));
  }

  private get(list: Pedido[], id: string): Pedido {
    const p = list.find((x) => x.id === id);
    if (!p) throw new Error("El pedido ya no existe.");
    return p;
  }

  async list() {
    return this.read();
  }

  async create(n: NuevoPedido) {
    const list = this.read();
    const numero = this.nextNumero(list);
    const p = crearPedido(n.input, {
      id: newId(),
      numero,
      eventoId: newId(),
      estado: n.estado,
      origen: n.origen,
      datosCalculo: n.datosCalculo,
    });
    this.write([p, ...list]);
    writeString(KEYS.pedidoSeq, String(numero));
    return p;
  }

  async update(id: string, input: PedidoInput) {
    const list = this.read();
    const p = editarPedido(this.get(list, id), input, newId());
    this.replace(list, p);
    return p;
  }

  async setEstado(id: string, estado: Estado, nota?: string) {
    const list = this.read();
    const res = aplicarCambioEstado(this.get(list, id), estado, {
      eventoIds: [newId(), newId()],
      tuEmail: this.tuEmail(),
      simulado: true,
      nota,
    });
    this.replace(list, res.pedido);
    return res;
  }

  async reenviarAviso(id: string) {
    const list = this.read();
    const res = registrarAviso(this.get(list, id), newId(), this.tuEmail(), true);
    this.replace(list, res.pedido);
    return res;
  }

  async remove(id: string) {
    this.write(this.read().filter((p) => p.id !== id));
  }
}
