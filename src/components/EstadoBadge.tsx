import { ESTADO_LABEL, type Estado } from "../lib/pedidos";

/** Colores por estado: claros en modo claro, translúcidos en oscuro. */
export const ESTADO_CLASS: Record<Estado, string> = {
  pendiente: "bg-stone-100 text-stone-700 ring-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
  en_cola: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
  imprimiendo: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
  post_procesado: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  terminado: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  entregado: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
  cancelado: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
};

export const ESTADO_DOT: Record<Estado, string> = {
  pendiente: "bg-stone-400",
  en_cola: "bg-sky-500",
  imprimiendo: "bg-violet-500",
  post_procesado: "bg-amber-500",
  terminado: "bg-emerald-500",
  entregado: "bg-teal-600",
  cancelado: "bg-red-500",
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ESTADO_CLASS[estado]}`}
    >
      <span className={`size-1.5 rounded-full ${ESTADO_DOT[estado]} ${estado === "imprimiendo" ? "animate-pulse" : ""}`} />
      {ESTADO_LABEL[estado]}
    </span>
  );
}
