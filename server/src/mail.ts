// Aviso por mail cuando un pedido pasa a "terminado".
import nodemailer from "nodemailer";
import { formatNumeroPedido, type Aviso, type Pedido } from "../../src/lib/pedidos";
import { businessContactLines, type BusinessInfo } from "../../src/lib/quote";
import type { MailConfig } from "./config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Lo que el resto del servidor necesita para mandar mails (en los tests se reemplaza por uno falso). */
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export function createMailer(cfg: MailConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(msg) {
      await transport.sendMail({ from: cfg.from, ...msg });
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], footer: string[]): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#0f766e">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(p)}</p>`).join("\n")}
${footer.length ? `<p style="margin:20px 0 0;font-size:13px;color:#78716c;line-height:1.5">${footer.map(esc).join("<br>")}</p>` : ""}
</div></body></html>`;
}

/** Mails del aviso: uno por destinatario, con texto distinto para vos y para el cliente. */
export function avisoMessages(p: Pedido, aviso: Aviso, business: BusinessInfo): MailMessage[] {
  const n = formatNumeroPedido(p.numero);
  const negocio = business.name.trim() || "Impresiones 3D";
  return aviso.destinatarios.map(({ rol, email }) => {
    if (rol === "vos") {
      const lines = [
        `El pedido ${n} de ${p.clienteNombre} pasó a Terminado.`,
        `${p.cantidad} × ${p.descripcion}`,
        p.clienteTelefono ? `Teléfono del cliente: ${p.clienteTelefono}` : "",
        p.notificarCliente && p.clienteEmail ? `También se le avisó al cliente (${p.clienteEmail}).` : "Al cliente no se le avisó por mail.",
      ].filter(Boolean);
      return {
        to: email,
        subject: `Pedido ${n} terminado · ${p.clienteNombre}`,
        text: lines.join("\n"),
        html: layout(`Pedido ${n} terminado`, lines, []),
      };
    }
    const contacto = businessContactLines(business);
    const lines = [
      `¡Hola ${p.clienteNombre}!`,
      `Tu pedido ${n} ya está listo: ${p.cantidad} × ${p.descripcion}.`,
      "Escribinos para coordinar la entrega o el retiro.",
    ];
    return {
      to: email,
      subject: `Tu pedido ${n} está listo · ${negocio}`,
      text: [...lines, "", negocio, ...contacto].join("\n"),
      html: layout("Tu pedido está listo", lines, [negocio, ...contacto]),
    };
  });
}
