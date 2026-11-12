// Configuración leída de variables de entorno (ver .env.example).
import path from "node:path";

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface Config {
  port: number;
  databaseUrl: string;
  /** Usuario y contraseña del único usuario (vos). */
  adminUser: string;
  adminPassword: string;
  sessionDays: number;
  /** Cookie solo por HTTPS. En Coolify siempre true; false solo para probar en http://localhost. */
  cookieSecure: boolean;
  /** Carpeta con el build del front (vite build). Vacío = no servir el front. */
  staticDir: string;
  /** null = SMTP sin configurar: los avisos se registran como simulados. */
  mail: MailConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Falta DATABASE_URL (ej: postgres://usuario:clave@localhost:5432/calc3d).");

  const adminUser = env.ADMIN_USER?.trim() ?? "";
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (!adminUser) throw new Error("Falta ADMIN_USER (el usuario para entrar a la app).");
  if (adminPassword.length < 10) throw new Error("Falta ADMIN_PASSWORD o es muy corta (mínimo 10 caracteres).");

  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT ?? 587);
  const mail: MailConfig | null = host
    ? {
        host,
        port,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
        user: env.SMTP_USER?.trim() ?? "",
        pass: env.SMTP_PASS ?? "",
        from: env.MAIL_FROM?.trim() || env.SMTP_USER?.trim() || "",
      }
    : null;
  if (mail && !mail.from) throw new Error("Configuraste SMTP_HOST pero falta MAIL_FROM (o SMTP_USER).");

  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl,
    adminUser,
    adminPassword,
    sessionDays: Math.max(1, Number(env.SESSION_DAYS ?? 90) || 90),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production",
    staticDir: env.STATIC_DIR === undefined ? path.resolve("../dist") : env.STATIC_DIR.trim(),
    mail,
  };
}
