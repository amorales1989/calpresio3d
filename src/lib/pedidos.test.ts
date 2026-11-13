import { describe, expect, it } from "vitest";
import {
  cambiarEstado,
  contarPorEstado,
  crearPedido,
  destinatariosAviso,
  editarPedido,
  emptyInput,
  filtrarPedidos,
  formatNumeroPedido,
  hoyISO,
  normalizePedido,
  ordenarPedidos,
  registrarAviso,
  siguienteEstado,
  totalPedido,
  urgencia,
  validarInput,
  type Pedido,
  type PedidoInput,
} from "./pedidos";
import { itemLibre } from "./items";

const item = (descripcion: string, cantidad: number, precioUnitario: number) =>
  itemLibre({ id: `i-${descripcion}`, descripcion, cantidad, precioUnitario });

const T0 = "2026-11-12T12:00:00.000Z";
let seq = 0;
const ids = (): [string, string] => [`e${++seq}`, `e${++seq}`];

function input(over: Partial<PedidoInput> = {}): PedidoInput {
  return { ...emptyInput(), clienteNombre: "Ana", items: [item("Maceta", 1, 1000)], ...over };
}

function pedido(over: Partial<PedidoInput> = {}, numero = 1): Pedido {
  return crearPedido(input(over), { id: `p${numero}`, numero, eventoId: `c${numero}`, origen: { tipo: "manual" }, datosCalculo: null }, T0);
}

describe("validación y totales", () => {
  it("exige cliente y descripción, y valida el email", () => {
    const e = validarInput({ ...emptyInput(), clienteEmail: "no-es-mail" });
    expect(Object.keys(e).sort()).toEqual(["clienteEmail", "clienteNombre", "items"]);
    expect(validarInput(input({ clienteEmail: "ana@mail.com" }))).toEqual({});
  });

  it("calcula el total redondeado", () => {
    expect(totalPedido({ items: [item("A", 3, 1234.567), item("B", 2, 500)] })).toBe(4703.7);
  });

  it("valida los ítems y descarta los vacíos", () => {
    expect(validarInput(input({ items: [item("", 1, 500)] })).items).toBe("Hay un ítem sin descripción.");
    expect(validarInput(input({ items: [item("A", 0, 500)] })).items).toBe("Las cantidades tienen que ser 1 o más.");
    const p = pedido({ items: [item("Maceta", 2, 1000), item("  ", 1, 0)] });
    expect(p.items.map((i) => i.descripcion)).toEqual(["Maceta"]);
  });

  it("formatea el número", () => {
    expect(formatNumeroPedido(7)).toBe("#0007");
  });

  it("no deja notificar al cliente sin email", () => {
    expect(pedido({ clienteEmail: "", notificarCliente: true }).notificarCliente).toBe(false);
    expect(pedido({ clienteEmail: " ana@mail.com ", notificarCliente: true }).clienteEmail).toBe("ana@mail.com");
  });
});

describe("flujo de estados", () => {
  it("sigue el orden y termina en entregado", () => {
    expect(siguienteEstado("pendiente")).toBe("en_cola");
    expect(siguienteEstado("terminado")).toBe("entregado");
    expect(siguienteEstado("entregado")).toBeNull();
    expect(siguienteEstado("cancelado")).toBeNull();
  });

  it("registra el cambio en el historial", () => {
    const { pedido: p, aviso } = cambiarEstado(pedido(), "imprimiendo", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: true });
    expect(p.estado).toBe("imprimiendo");
    expect(aviso).toBeNull();
    expect(p.historial.at(-1)).toMatchObject({ tipo: "estado", desde: "pendiente", hasta: "imprimiendo" });
  });

  it("mismo estado no hace nada", () => {
    const p = pedido();
    expect(cambiarEstado(p, "pendiente", { eventoIds: ids(), tuEmail: "", simulado: true }).pedido).toBe(p);
  });

  it("al terminar avisa a vos y al cliente, una sola vez", () => {
    const p0 = pedido({ clienteEmail: "ana@mail.com", notificarCliente: true });
    const r1 = cambiarEstado(p0, "terminado", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: true }, T0);
    expect(r1.aviso?.destinatarios).toEqual([
      { rol: "vos", email: "yo@imek.com" },
      { rol: "cliente", email: "ana@mail.com" },
    ]);
    expect(r1.pedido.avisoAt).toBe(T0);
    expect(r1.pedido.terminadoAt).toBe(T0);
    expect(r1.pedido.historial.at(-1)?.tipo).toBe("aviso");

    // vuelve a imprimir y termina de nuevo: no se repite el aviso automático
    const r2 = cambiarEstado(r1.pedido, "imprimiendo", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: true });
    const r3 = cambiarEstado(r2.pedido, "terminado", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: true });
    expect(r3.aviso).toBeNull();
    expect(r3.pedido.terminadoAt).toBe(T0);
  });

  it("si no hay a quién avisar, lo explica y no marca avisoAt", () => {
    const r = cambiarEstado(pedido(), "terminado", { eventoIds: ids(), tuEmail: "", simulado: true });
    expect(r.aviso?.destinatarios).toEqual([]);
    expect(r.aviso?.motivo).toMatch(/No hay a quién avisar/);
    expect(r.pedido.avisoAt).toBeNull();
  });

  it("reenviar el aviso suma un evento sin cambiar la primera fecha", () => {
    const r1 = cambiarEstado(pedido(), "terminado", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: false }, T0);
    const r2 = registrarAviso(r1.pedido, "x", "yo@imek.com", false, "2026-11-13T10:00:00.000Z");
    expect(r2.pedido.avisoAt).toBe(T0);
    expect(r2.pedido.historial.filter((e) => e.tipo === "aviso")).toHaveLength(2);
  });

  it("respeta la preferencia de no avisar al cliente", () => {
    expect(destinatariosAviso({ clienteEmail: "ana@mail.com", notificarCliente: false }, "yo@imek.com")).toEqual([
      { rol: "vos", email: "yo@imek.com" },
    ]);
  });
});

describe("listas", () => {
  const hoy = "2026-11-12";

  it("marca urgencias solo en pedidos sin terminar", () => {
    expect(urgencia({ estado: "imprimiendo", fechaEntrega: "2026-11-10" }, hoy)).toBe("atrasado");
    expect(urgencia({ estado: "pendiente", fechaEntrega: hoy }, hoy)).toBe("hoy");
    expect(urgencia({ estado: "pendiente", fechaEntrega: "2026-11-14" }, hoy)).toBe("pronto");
    expect(urgencia({ estado: "pendiente", fechaEntrega: "2026-11-20" }, hoy)).toBeNull();
    expect(urgencia({ estado: "terminado", fechaEntrega: "2026-11-10" }, hoy)).toBeNull();
    expect(urgencia({ estado: "entregado", fechaEntrega: "2026-11-10" }, hoy)).toBeNull();
  });

  it("ordena activos por fecha de entrega y deja cerrados al final", () => {
    const a = pedido({ fechaEntrega: "2026-11-20" }, 1);
    const b = pedido({ fechaEntrega: "2026-11-15" }, 2);
    const c = pedido({}, 3);
    const d = { ...pedido({ fechaEntrega: "2026-11-01" }, 4), estado: "entregado" as const };
    expect(ordenarPedidos([a, b, c, d]).map((p) => p.numero)).toEqual([2, 1, 3, 4]);
  });

  it("filtra por estado y busca sin tildes ni #", () => {
    const a = pedido({ clienteNombre: "José Pérez" }, 12);
    const b = { ...pedido({ clienteNombre: "Ana" }, 13), estado: "cancelado" as const };
    expect(filtrarPedidos([a, b], "activos", "").map((p) => p.numero)).toEqual([12]);
    expect(filtrarPedidos([a, b], "todos", "jose perez").map((p) => p.numero)).toEqual([12]);
    expect(filtrarPedidos([a, b], "todos", "#0013").map((p) => p.numero)).toEqual([13]);
    expect(contarPorEstado([a, b])).toMatchObject({ pendiente: 1, cancelado: 1, terminado: 0 });
  });

  it("hoyISO usa la fecha local", () => {
    expect(hoyISO(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("edición y normalización", () => {
  it("editar no toca estado ni número y deja registro", () => {
    const p = pedido();
    const e = editarPedido(p, input({ items: [item("Maceta grande", 2, 1000)] }), "ed1");
    expect(e).toMatchObject({ numero: 1, estado: "pendiente" });
    expect(e.items).toMatchObject([{ descripcion: "Maceta grande", cantidad: 2 }]);
    expect(e.historial.at(-1)?.tipo).toBe("editado");
  });

  it("normaliza datos rotos sin romper", () => {
    expect(normalizePedido(null)).toBeNull();
    const p = normalizePedido({ id: "x", estado: "inventado", cantidad: -3, moneda: "XXX", fechaEntrega: "mañana", historial: [{}] });
    expect(p).toMatchObject({ estado: "pendiente", items: [], moneda: "ARS", fechaEntrega: "", historial: [], clienteNombre: "Sin nombre" });
  });

  it("convierte los pedidos viejos (un solo producto) a un ítem", () => {
    const p = normalizePedido({
      id: "viejo",
      descripcion: "Llavero",
      cantidad: 10,
      precioUnitario: 1800,
      origen: { tipo: "producto", productoId: "prod-1", nombre: "Llavero" },
    })!;
    expect(p.items).toEqual([{ id: "viejo-1", productoId: "prod-1", descripcion: "Llavero", detalle: "", cantidad: 10, precioUnitario: 1800 }]);
    expect(totalPedido(p)).toBe(18000);
  });

  it("ida y vuelta por JSON conserva el pedido", () => {
    const p = cambiarEstado(pedido({ clienteEmail: "ana@mail.com" }), "terminado", { eventoIds: ids(), tuEmail: "yo@imek.com", simulado: true }).pedido;
    expect(normalizePedido(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
