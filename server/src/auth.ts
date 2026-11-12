// Login de un solo usuario con sesiones guardadas en la base.
// La cookie lleva un token al azar; en la base solo se guarda su hash.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";
import type { Db } from "./db.js";

export const COOKIE = "calc3d_sid";

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const hashToken = (t: string) => sha256(t).toString("hex");

/** Compara en tiempo constante (sin filtrar por cuánto tarda cuántos caracteres coinciden). */
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// ---------- límite de intentos fallidos (en memoria, por IP) ----------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map<string, { n: number; since: number }>();

export function loginBlocked(ip: string, now = Date.now()): boolean {
  const f = fails.get(ip);
  if (!f) return false;
  if (now - f.since > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return f.n >= MAX_FAILS;
}

export function registerFail(ip: string, now = Date.now()) {
  const f = fails.get(ip);
  if (!f || now - f.since > WINDOW_MS) fails.set(ip, { n: 1, since: now });
  else f.n++;
}

export const clearFails = (ip: string) => fails.delete(ip);

// ---------- sesiones ----------

export async function createSession(db: Db, days: number): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + days * 86_400_000);
  await db.query("insert into sessions (token_hash, expires_at) values ($1, $2)", [hashToken(token), expires]);
  // De paso, limpiar sesiones vencidas
  await db.query("delete from sessions where expires_at < now()");
  return { token, expires };
}

export async function validSession(db: Db, token: string | null): Promise<boolean> {
  if (!token) return false;
  const { rowCount } = await db.query("select 1 from sessions where token_hash = $1 and expires_at > now()", [hashToken(token)]);
  return (rowCount ?? 0) > 0;
}

export async function deleteSession(db: Db, token: string | null) {
  if (token) await db.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}

export function setSessionCookie(res: Response, cfg: Config, token: string, expires: Date) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cfg.cookieSecure, expires, path: "/" });
}

export function clearSessionCookie(res: Response, cfg: Config) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: cfg.cookieSecure, path: "/" });
}

/** Corta con 401 si no hay sesión válida. */
export function requireAuth(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (await validSession(db, readCookie(req, COOKIE))) return next();
      res.status(401).json({ error: "Tenés que iniciar sesión." });
    } catch (e) {
      next(e);
    }
  };
}
