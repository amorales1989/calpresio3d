// Estados de un pedido. Mantener sincronizado con src/lib/pedidos.ts del front.

export const ESTADOS = [
  "pendiente",
  "en_cola",
  "imprimiendo",
  "post_procesado",
  "terminado",
  "entregado",
  "cancelado",
] as const;

export type Estado = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_cola: "En cola",
  imprimiendo: "Imprimiendo",
  post_procesado: "Post-procesado",
  terminado: "Terminado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const isEstado = (v: unknown): v is Estado => typeof v === "string" && (ESTADOS as readonly string[]).includes(v);

/** Estado que dispara el aviso por mail. */
export const ESTADO_AVISO: Estado = "terminado";
