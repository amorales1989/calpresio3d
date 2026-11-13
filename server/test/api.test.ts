// Tests de integración contra un PostgreSQL real. Se saltean si no hay TEST_DATABASE_URL.
// Ej: docker run -d --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=calc3d -p 55432:5432 postgres:17-alpine
//     TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/calc3d npm test
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, migrate, type Db } from "../src/db.js";
import type { MailMessage, Mailer } from "../src/mail.js";

const url = process.env.TEST_DATABASE_URL;

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  fail = false;
  async send(msg: MailMessage) {
    if (this.fail) throw new Error("SMTP caído");
    this.sent.push(msg);
  }
}

describe.skipIf(!url)("API", () => {
  let db: Db;
  let server: Server;
  let base: string;
  let cookie = "";
  const mailer = new FakeMailer();

  const call = async (method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.auth === false ? {} : { cookie }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };

  const input = (over: Record<string, unknown> = {}) => ({
    clienteNombre: "Juan Pérez",
    clienteEmail: "juan@example.com",
    clienteTelefono: "11 5555-5555",
    items: [
      { id: "i1", productoId: "prod-1", descripcion: "Soporte de auriculares", detalle: "Material: PLA negro", cantidad: 2, precioUnitario: 7884.73 },
    ],
    moneda: "ARS",
    fechaEntrega: "",
    notas: "",
    notificarCliente: true,
    ...over,
  });

  beforeAll(async () => {
    const cfg = loadConfig({ DATABASE_URL: url, ADMIN_USER: "ale", ADMIN_PASSWORD: "clave-de-prueba-123", STATIC_DIR: "" });
    db = createDb(cfg.databaseUrl);
    await db.query("drop schema public cascade; create schema public;");
    await migrate(db);
    await migrate(db); // idempotente
    server = createApp({ cfg, db, mailer }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await db?.end();
  });

  beforeEach(() => {
    mailer.sent = [];
    mailer.fail = false;
  });

  it("healthcheck sin login", async () => {
    expect((await call("GET", "/healthz", undefined, { auth: false })).status).toBe(200);
  });

  it("pide login y rechaza credenciales incorrectas", async () => {
    expect((await call("GET", "/api/data", undefined, { auth: false })).status).toBe(401);
    const bad = await call("POST", "/api/login", { user: "ale", password: "otra" }, { auth: false });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toMatch(/incorrectos/);
  });

  it("inicia sesión con cookie httpOnly", async () => {
    const r = await call("POST", "/api/login", { user: "ale", password: "clave-de-prueba-123" }, { auth: false });
    expect(r.status).toBe(200);
    const set = r.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    cookie = set.split(";")[0];
    expect((await call("GET", "/api/session")).body.user).toBe("ale");
  });

  it("rechaza cuerpos que no son JSON", async () => {
    const res = await fetch(base + "/api/pedidos", { method: "POST", headers: { cookie, "content-type": "text/plain" }, body: "x" });
    expect(res.status).toBe(415);
  });

  it("guarda, lista y borra perfiles y productos", async () => {
    const profile = { id: "p1", name: "Bambu A1", currency: "ARS", priceKg: 25000, priceKwh: 140, printerModel: "custom", consumptionW: 120, machineLifespanHours: 4320, repairCosts: 150000, errorMarginPercent: 5 };
    expect((await call("PUT", "/api/profiles/p1", profile)).status).toBe(200);
    expect((await call("PUT", "/api/profiles/otro", profile)).status).toBe(400);
    const product = { id: "pr1", name: "Soporte", material: "PLA negro", description: "", createdAt: new Date().toISOString(), piece: {}, profile, results: { total: 100 } };
    expect((await call("PUT", "/api/products/pr1", product)).body.material).toBe("PLA negro");
    expect((await call("PUT", "/api/settings/business", { name: "Taller", phone: "", email: "yo@taller.com", instagram: "" })).status).toBe(200);
    expect((await call("PUT", "/api/settings/quoteSeq", { value: 8 })).status).toBe(200);

    const data = (await call("GET", "/api/data")).body;
    expect(data.profiles.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect(data.products[0].name).toBe("Soporte");
    expect(data.business.email).toBe("yo@taller.com");
    expect(data.quoteSeq).toBe(8);
    expect(data.mail).toBe(true);

    expect((await call("DELETE", "/api/products/pr1")).status).toBe(204);
    expect((await call("GET", "/api/data")).body.products).toEqual([]);
  });

  it("valida los pedidos con las mismas reglas del front", async () => {
    const r = await call("POST", "/api/pedidos", { input: input({ clienteNombre: " " }) });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/nombre del cliente/);
  });

  it("crea pedidos con número correlativo, también en paralelo", async () => {
    const rs = await Promise.all([1, 2, 3].map(() => call("POST", "/api/pedidos", { input: input(), origen: { tipo: "manual" } })));
    expect(rs.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(rs.map((r) => r.body.numero).sort()).toEqual([1, 2, 3]);
    expect(rs[0].body.historial[0].tipo).toBe("creado");
  });

  it("al pasar a terminado avisa por mail a vos y al cliente, una sola vez", async () => {
    const p = (await call("POST", "/api/pedidos", { input: input() })).body;
    const r = await call("POST", `/api/pedidos/${p.id}/estado`, { estado: "terminado" });
    expect(r.status).toBe(200);
    expect(r.body.aviso.simulado).toBe(false);
    expect(r.body.pedido.avisoAt).not.toBeNull();
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["juan@example.com", "yo@taller.com"]);
    expect(mailer.sent.find((m) => m.to === "juan@example.com")!.subject).toMatch(/está listo · Taller/);

    await call("POST", `/api/pedidos/${p.id}/estado`, { estado: "entregado" });
    await call("POST", `/api/pedidos/${p.id}/estado`, { estado: "terminado" });
    expect(mailer.sent).toHaveLength(2); // no se repite
  });

  it("si el mail falla, el pedido queda sin avisar y se puede reenviar", async () => {
    const p = (await call("POST", "/api/pedidos", { input: input() })).body;
    mailer.fail = true;
    const r = await call("POST", `/api/pedidos/${p.id}/estado`, { estado: "terminado" });
    expect(r.body.pedido.estado).toBe("terminado");
    expect(r.body.pedido.avisoAt).toBeNull();
    expect(r.body.aviso.motivo).toMatch(/No se pudo enviar/);

    mailer.fail = false;
    const re = await call("POST", `/api/pedidos/${p.id}/aviso`, {});
    expect(re.body.pedido.avisoAt).not.toBeNull();
    expect(mailer.sent).toHaveLength(2);
  });

  it("edita y borra pedidos", async () => {
    const p = (await call("POST", "/api/pedidos", { input: input() })).body;
    const items = [
      { id: "i1", productoId: "prod-1", descripcion: "Soporte de auriculares", detalle: "", cantidad: 5, precioUnitario: 7884.73 },
      { id: "i2", productoId: null, descripcion: "Envío", detalle: "", cantidad: 1, precioUnitario: 3000 },
    ];
    const e = await call("PUT", `/api/pedidos/${p.id}`, { input: input({ items }) });
    expect(e.body.items.map((i: { cantidad: number }) => i.cantidad)).toEqual([5, 1]);
    const mal = await call("PUT", `/api/pedidos/${p.id}`, { input: input({ items: [{ ...items[0], cantidad: 0 }] }) });
    expect(mal.status).toBe(400);
    expect(e.body.historial.at(-1).tipo).toBe("editado");
    expect((await call("DELETE", `/api/pedidos/${p.id}`)).status).toBe(204);
    expect((await call("PUT", `/api/pedidos/${p.id}`, { input: input() })).status).toBe(404);
  });

  it("importa los datos del navegador sin pisar números de pedido", async () => {
    const local = {
      id: "local-1",
      numero: 1, // ya existe en el servidor
      clienteNombre: "Ana",
      descripcion: "Llavero",
      cantidad: 10,
      precioUnitario: 1800,
      estado: "en_cola",
      historial: [],
    };
    const r = await call("POST", "/api/import", { profiles: [], products: [], pedidos: [local], business: { name: "Otro" }, quoteSeq: 20 });
    expect(r.body.pedidos).toBe(1);
    const data = (await call("GET", "/api/data")).body;
    const ana = data.pedidos.find((p: { id: string }) => p.id === "local-1");
    expect(ana.numero).toBeGreaterThan(1);
    expect(data.business.name).toBe("Taller"); // no pisa los datos de la empresa
    expect(data.quoteSeq).toBe(20);
  });

  it("cerrar sesión invalida la cookie", async () => {
    expect((await call("POST", "/api/logout", {})).status).toBe(204);
    expect((await call("GET", "/api/data")).status).toBe(401);
  });
});
