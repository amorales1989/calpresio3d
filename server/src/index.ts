// Arranque: lee la configuración, migra la base y levanta el servidor.
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb, migrate } from "./db.js";
import { createMailer } from "./mail.js";

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
await migrate(db);

const mailer = cfg.mail ? createMailer(cfg.mail) : null;
const server = createApp({ cfg, db, mailer }).listen(cfg.port, () => {
  console.log(`Servidor en el puerto ${cfg.port} · front: ${cfg.staticDir || "no"} · mails: ${mailer ? "SMTP" : "simulados"}`);
});

// Coolify manda SIGTERM al redeployar: cerrar prolijo
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => void db.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
