// API + front en una sola app. Las reglas de pedidos, perfiles y productos son las mismas del front (../src/lib).
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { normalizeProduct, normalizeProfile, type Product, type Profile } from "../../src/lib/model";
import {
  cambiarEstado,
  crearPedido,
  editarPedido,
  isEstado,
  normalizePedido,
  registrarAviso,
  validarInput,
  type Aviso,
  type Pedido,
  type PedidoInput,
} from "../../src/lib/pedidos";
import { normalizeBusiness, type BusinessInfo } from "../../src/lib/quote";
import {
  COOKIE,
  clearFails,
  clearSessionCookie,
  createSession,
  deleteSession,
  loginBlocked,
  readCookie,
  registerFail,
  requireAuth,
  sameSecret,
  setSessionCookie,
} from "./auth.js";
import type { Config } from "./config.js";
import { tx, type Db, type Tx } from "./db.js";
import { avisoMessages, type Mailer } from "./mail.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Deps {
  cfg: Config;
  db: Db;
  mailer: Mailer | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_DATOS_CALCULO = 50_000;

// ---------- lectura y validación de lo que manda el front ----------

/** Toma los campos del formulario de pedido; normalizePedido limpia tipos y validarInput aplica las reglas del front. */
function parseInput(v: unknown): PedidoInput {
  if (!isObj(v)) throw new HttpError(400, "Faltan los datos del pedido.");
  const p = normalizePedido({ ...v, id: "x", numero: 1 })!;
  const input: PedidoInput = {
    clienteNombre: typeof v.clienteNombre === "string" ? v.clienteNombre : "",
    clienteEmail: p.clienteEmail,
    clienteTelefono: p.clienteTelefono,
    items: p.items,
    moneda: p.moneda,
    fechaEntrega: p.fechaEntrega,
    notas: p.notas,
    notificarCliente: p.notificarCliente,
  };
  // normalizePedido corrige las cantidades inválidas a 1: acá se rechazan, como en el front
  const raw = Array.isArray(v.items) ? v.items : [];
  if (raw.some((i) => isObj(i) && (typeof i.cantidad !== "number" || !Number.isInteger(i.cantidad) || i.cantidad < 1))) {
    throw new HttpError(400, "Las cantidades tienen que ser 1 o más.");
  }
  const errores = Object.values(validarInput(input));
  if (errores.length) throw new HttpError(400, errores[0]!);
  const largo = input.items.some((i) => i.descripcion.length > 200 || i.detalle.length > 300 || i.id.length > 100 || (i.productoId?.length ?? 0) > 100);
  if (largo || input.clienteNombre.length > 120 || input.notas.length > 2000) {
    throw new HttpError(400, "Hay un texto demasiado largo.");
  }
  return input;
}

function parseDatosCalculo(v: unknown) {
  if (!isObj(v)) return null;
  if (JSON.stringify(v).length > MAX_DATOS_CALCULO) throw new HttpError(400, "Los datos del cálculo son demasiado grandes.");
  return normalizePedido({ id: "x", datosCalculo: v })!.datosCalculo;
}

// ---------- acceso a la base ----------

async function getBusiness(c: Tx | Db): Promise<BusinessInfo> {
  const { rows } = await c.query("select value from settings where key = 'business'");
  return normalizeBusiness(rows[0]?.value);
}

async function lockPedido(c: Tx, id: string): Promise<Pedido> {
  const { rows } = await c.query("select data from pedidos where id = $1 for update", [id]);
  const p = rows[0] ? normalizePedido(rows[0].data) : null;
  if (!p) throw new HttpError(404, "El pedido ya no existe.");
  return p;
}

async function savePedido(c: Tx, p: Pedido, insert = false) {
  const sql = insert
    ? "insert into pedidos (id, numero, estado, data) values ($1, $2, $3, $4)"
    : "update pedidos set numero = $2, estado = $3, data = $4, updated_at = now() where id = $1";
  await c.query(sql, [p.id, p.numero, p.estado, JSON.stringify(p)]);
}

async function nextNumero(c: Tx): Promise<number> {
  // Un lock por transacción alcanza: los números quedan correlativos aunque lleguen dos altas juntas
  await c.query("select pg_advisory_xact_lock(727002)");
  const { rows } = await c.query<{ n: number }>("select coalesce(max(numero), 0) + 1 as n from pedidos");
  return rows[0].n;
}

export function createApp({ cfg, db, mailer }: Deps) {
  /**
   * Manda los mails del aviso. Si falla, el pedido queda como "sin avisar" (se puede reenviar)
   * y el historial registra el error en lugar del envío.
   */
  async function entregarAviso(antes: Pedido, res: { pedido: Pedido; aviso: Aviso }, business: BusinessInfo) {
    if (!mailer || !res.aviso.destinatarios.length) return res;
    try {
      for (const msg of avisoMessages(res.pedido, res.aviso, business)) await mailer.send(msg);
      return res;
    } catch (e) {
      console.error("Error enviando aviso:", e);
      const motivo = `No se pudo enviar el mail (${e instanceof Error ? e.message : "error desconocido"}). Probá con “Reenviar aviso”.`;
      const historial = [...res.pedido.historial];
      historial[historial.length - 1] = { ...historial[historial.length - 1], detalle: motivo };
      return {
        pedido: { ...res.pedido, avisoAt: antes.avisoAt, historial },
        aviso: { ...res.aviso, motivo },
      };
    }
  }

  const app = express();
  app.set("trust proxy", 1); // detrás del proxy de Coolify: IP real y HTTPS
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  // Para el healthcheck de Coolify: responde 200 solo si la base contesta
  app.get("/healthz", async (_req, res) => {
    try {
      await db.query("select 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  const api = express.Router();
  api.use(express.json({ limit: "5mb" }));
  // Solo JSON en lo que modifica: un formulario de otro sitio no puede mandar JSON sin permiso (CSRF)
  api.use((req, _res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
      return next(new HttpError(415, "El cuerpo tiene que ser JSON."));
    }
    next();
  });

  // ---------- sesión ----------

  api.post("/login", async (req, res) => {
    const ip = req.ip ?? "?";
    if (loginBlocked(ip)) throw new HttpError(429, "Demasiados intentos. Esperá 15 minutos y probá de nuevo.");
    const { user, password } = isObj(req.body) ? req.body : {};
    const ok =
      typeof user === "string" &&
      typeof password === "string" &&
      // las dos comparaciones siempre se hacen, para no revelar cuál falló
      [sameSecret(user.trim(), cfg.adminUser), sameSecret(password, cfg.adminPassword)].every(Boolean);
    if (!ok) {
      registerFail(ip);
      throw new HttpError(401, "Usuario o contraseña incorrectos.");
    }
    clearFails(ip);
    const { token, expires } = await createSession(db, cfg.sessionDays);
    setSessionCookie(res, cfg, token, expires);
    res.json({ user: cfg.adminUser });
  });

  api.post("/logout", async (req, res) => {
    await deleteSession(db, readCookie(req, COOKIE));
    clearSessionCookie(res, cfg);
    res.status(204).end();
  });

  api.use(requireAuth(db));

  api.get("/session", (_req, res) => {
    res.json({ user: cfg.adminUser });
  });

  // ---------- todos los datos de una vez (al abrir la app) ----------

  api.get("/data", async (_req, res) => {
    const [profiles, products, settings, pedidos] = await Promise.all([
      db.query("select data from profiles order by updated_at"),
      db.query("select data from products"),
      db.query("select key, value from settings"),
      db.query("select data from pedidos order by numero desc"),
    ]);
    const setting = (k: string) => settings.rows.find((r) => r.key === k)?.value;
    res.json({
      profiles: profiles.rows.map((r) => r.data),
      products: products.rows.map((r) => r.data),
      business: normalizeBusiness(setting("business")),
      quoteSeq: Number(setting("quoteSeq")) || 1,
      pedidos: pedidos.rows.map((r) => r.data),
      mail: !!mailer,
    });
  });

  // ---------- perfiles y productos (el front manda el documento entero) ----------

  function documentRoutes<T extends { id: string }>(table: "profiles" | "products", normalize: (v: unknown) => T | null) {
    api.put(`/${table}/:id`, async (req, res) => {
      const doc = normalize(req.body);
      if (!doc || doc.id !== req.params.id) throw new HttpError(400, "Datos inválidos.");
      await db.query(
        `insert into ${table} (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [doc.id, JSON.stringify(doc)],
      );
      res.json(doc);
    });
    api.delete(`/${table}/:id`, async (req, res) => {
      await db.query(`delete from ${table} where id = $1`, [req.params.id]);
      res.status(204).end();
    });
  }
  documentRoutes<Profile>("profiles", normalizeProfile);
  documentRoutes<Product>("products", normalizeProduct);

  // ---------- ajustes: datos de la empresa y numeración de presupuestos ----------

  async function putSetting(key: string, value: unknown) {
    await db.query(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()",
      [key, JSON.stringify(value)],
    );
  }

  api.put("/settings/business", async (req, res) => {
    const b = normalizeBusiness(req.body);
    if (Object.values(b).some((v) => v.length > 200)) throw new HttpError(400, "Hay un dato demasiado largo.");
    await putSetting("business", b);
    res.json(b);
  });

  api.put("/settings/quoteSeq", async (req, res) => {
    const n = isObj(req.body) ? Number(req.body.value) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 1e9) throw new HttpError(400, "Número inválido.");
    await putSetting("quoteSeq", n);
    res.json({ value: n });
  });

  // ---------- pedidos ----------

  api.get("/pedidos", async (_req, res) => {
    const { rows } = await db.query("select data from pedidos order by numero desc");
    res.json(rows.map((r) => r.data));
  });

  api.post("/pedidos", async (req, res) => {
    const body = isObj(req.body) ? req.body : {};
    const input = parseInput(body.input);
    const estado = isEstado(body.estado) ? body.estado : "pendiente";
    const origen = normalizePedido({ id: "x", origen: body.origen })!.origen;
    const datosCalculo = parseDatosCalculo(body.datosCalculo);
    const p = await tx(db, async (c) => {
      const pedido = crearPedido(input, { id: randomUUID(), numero: await nextNumero(c), eventoId: randomUUID(), estado, origen, datosCalculo });
      await savePedido(c, pedido, true);
      return pedido;
    });
    res.status(201).json(p);
  });

  api.put("/pedidos/:id", async (req, res) => {
    const input = parseInput(isObj(req.body) ? req.body.input : null);
    const p = await tx(db, async (c) => {
      const pedido = editarPedido(await lockPedido(c, req.params.id as string), input, randomUUID());
      await savePedido(c, pedido);
      return pedido;
    });
    res.json(p);
  });

  api.post("/pedidos/:id/estado", async (req, res) => {
    const body = isObj(req.body) ? req.body : {};
    if (!isEstado(body.estado)) throw new HttpError(400, "Estado inválido.");
    const estado = body.estado;
    const nota = typeof body.nota === "string" ? body.nota.slice(0, 500) : undefined;
    const out = await tx(db, async (c) => {
      const antes = await lockPedido(c, req.params.id as string);
      const business = await getBusiness(c);
      const r = cambiarEstado(antes, estado, { eventoIds: [randomUUID(), randomUUID()], tuEmail: business.email, simulado: !mailer, nota });
      const final = r.aviso ? await entregarAviso(antes, { pedido: r.pedido, aviso: r.aviso }, business) : r;
      await savePedido(c, final.pedido);
      return final;
    });
    res.json(out);
  });

  api.post("/pedidos/:id/aviso", async (req, res) => {
    const out = await tx(db, async (c) => {
      const antes = await lockPedido(c, req.params.id as string);
      const business = await getBusiness(c);
      const r = await entregarAviso(antes, registrarAviso(antes, randomUUID(), business.email, !mailer), business);
      await savePedido(c, r.pedido);
      return r;
    });
    res.json(out);
  });

  api.delete("/pedidos/:id", async (req, res) => {
    await db.query("delete from pedidos where id = $1", [req.params.id]);
    res.status(204).end();
  });

  // ---------- importar lo que había en el navegador (primera vez) ----------

  api.post("/import", async (req, res) => {
    const body = isObj(req.body) ? req.body : {};
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const profiles = arr(body.profiles).map(normalizeProfile).filter((x): x is Profile => !!x);
    const products = arr(body.products).map(normalizeProduct).filter((x): x is Product => !!x);
    const pedidos = arr(body.pedidos).map(normalizePedido).filter((x): x is Pedido => !!x);
    const counts = await tx(db, async (c) => {
      for (const [table, docs] of [["profiles", profiles], ["products", products]] as const) {
        for (const d of docs) {
          await c.query(
            `insert into ${table} (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data, updated_at = now()`,
            [d.id, JSON.stringify(d)],
          );
        }
      }
      // Los pedidos conservan su número salvo que ya lo use otro pedido
      for (const p of [...pedidos].sort((a, b) => a.numero - b.numero)) {
        const { rows } = await c.query("select id from pedidos where numero = $1", [p.numero]);
        const pedido = rows[0] && rows[0].id !== p.id ? { ...p, numero: await nextNumero(c) } : p;
        await c.query(
          `insert into pedidos (id, numero, estado, data) values ($1, $2, $3, $4)
           on conflict (id) do update set numero = excluded.numero, estado = excluded.estado, data = excluded.data, updated_at = now()`,
          [pedido.id, pedido.numero, pedido.estado, JSON.stringify(pedido)],
        );
      }
      // Datos de la empresa: solo si todavía no hay
      const business = normalizeBusiness(body.business);
      if (Object.values(business).some((v) => v.trim())) {
        await c.query("insert into settings (key, value) values ('business', $1) on conflict (key) do nothing", [JSON.stringify(business)]);
      }
      const seq = Number(body.quoteSeq);
      if (Number.isInteger(seq) && seq > 1) {
        await c.query(
          `insert into settings (key, value) values ('quoteSeq', $1)
           on conflict (key) do update set value = to_jsonb(greatest((settings.value)::text::int, $2::int)), updated_at = now()`,
          [JSON.stringify(seq), seq],
        );
      }
      return { profiles: profiles.length, products: products.length, pedidos: pedidos.length };
    });
    res.json(counts);
  });

  api.use((_req, _res, next) => next(new HttpError(404, "No existe esa ruta.")));
  app.use("/api", api);

  // ---------- front (build de Vite) ----------

  if (cfg.staticDir && existsSync(path.join(cfg.staticDir, "index.html"))) {
    app.use(
      express.static(cfg.staticDir, {
        index: false,
        setHeaders: (res, file) => {
          // Los assets llevan hash en el nombre: se pueden cachear para siempre
          res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(cfg.staticDir, "index.html"));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    const status = isObj(err) && typeof err.status === "number" ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? "Error del servidor." : "Pedido inválido." });
  });

  return app;
}
