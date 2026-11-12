// Configuración leída de variables de entorno (ver .env.example).

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
  apiToken: string;
  /** Orígenes permitidos para CORS (vacío = solo mismo origen, detrás de Nginx). */
  corsOrigins: string[];
  /** Tu mail: recibe un aviso cada vez que un pedido pasa a "terminado". */
  notifyEmail: string;
  businessName: string;
  businessContact: string;
  /** null = SMTP sin configurar: los avisos se registran pero no se envían. */
  mail: MailConfig | null;
}

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Falta DATABASE_URL (ej: postgres://usuario:clave@localhost:5432/calc3d).");

  const apiToken = env.API_TOKEN?.trim() ?? "";
  if (apiToken.length < 16) {
    throw new Error("Falta API_TOKEN o es muy corto (mínimo 16 caracteres). Generalo con: openssl rand -hex 24");
  }

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
    apiToken,
    corsOrigins: list(env.CORS_ORIGINS),
    notifyEmail: env.NOTIFY_EMAIL?.trim() ?? "",
    businessName: env.BUSINESS_NAME?.trim() || "Impresiones 3D",
    businessContact: env.BUSINESS_CONTACT?.trim() ?? "",
    mail,
  };
}
