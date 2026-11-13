import { useEffect, useId, useState } from "react";
import { formatMoney } from "../lib/calc";
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from "../lib/data";
import {
  AVISOS_POR_MAIL,
  ESTADOS,
  ESTADO_LABEL,
  formatNumeroPedido,
  hoyISO,
  isEmail,
  totalPedido,
  validarInput,
  type Estado,
  type PedidoInput,
} from "../lib/pedidos";
import type { Product } from "../lib/model";
import { ItemsEditor } from "./ItemsEditor";
import { TextField } from "./TextField";

export interface PedidoFormProps {
  /** Si viene, se edita ese pedido; si no, es un alta. */
  editing?: { numero: number };
  initial: PedidoInput;
  /** Texto corto de dónde salen los datos ("Pieza de la calculadora", "Producto: Maceta"). */
  origenLabel?: string;
  /** El mail del negocio: a quién le llega el aviso de "terminado". */
  tuEmail: string;
  /** Productos guardados para elegir los ítems. */
  products: Product[];
  onSubmit: (input: PedidoInput, estado: Estado) => Promise<void>;
  onClose: () => void;
}

export function PedidoForm({ editing, initial, origenLabel, tuEmail, products, onSubmit, onClose }: PedidoFormProps) {
  const [v, setV] = useState<PedidoInput>(initial);
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = { estado: useId(), moneda: useId(), notify: useId() };

  const set = <K extends keyof PedidoInput>(k: K, value: PedidoInput[K]) => setV((x) => ({ ...x, [k]: value }));
  const errors = validarInput(v);
  const valid = Object.keys(errors).length === 0;
  const err = (k: keyof PedidoInput) => (touched ? errors[k] : undefined);
  const symbol = CURRENCY_SYMBOLS[v.moneda];
  const clientEmailOk = isEmail(v.clienteEmail);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit(v, estado);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pedido-title"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:rounded-2xl dark:border-stone-800 dark:bg-stone-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <h2 id="pedido-title" className="text-base font-semibold">
              {editing ? `Editar pedido ${formatNumeroPedido(editing.numero)}` : "Nuevo pedido"}
            </h2>
            {origenLabel && <p className="truncate text-xs text-stone-500">{origenLabel}</p>}
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* ---------- qué ---------- */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Pedido</legend>
            <ItemsEditor
              items={v.items}
              onChange={(items) => set("items", items)}
              products={products}
              currency={v.moneda}
              error={err("items")}
            />
            <div className="flex max-w-40 flex-col gap-1.5">
              <label htmlFor={ids.moneda} className="text-xs font-medium text-stone-600 dark:text-stone-400">
                Moneda
              </label>
              <select id={ids.moneda} className="field-input" value={v.moneda} onChange={(e) => set("moneda", e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-baseline justify-between rounded-xl bg-teal-700 px-4 py-3 text-white dark:bg-teal-500 dark:text-stone-950">
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Total del pedido</span>
              <span className="text-xl font-bold tabular-nums">{formatMoney(totalPedido(v), symbol)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field error={err("fechaEntrega")}>
                <TextField
                  label="Fecha de entrega (opcional)"
                  type="date"
                  value={v.fechaEntrega}
                  onChange={(x) => set("fechaEntrega", x)}
                  hint={!editing && !v.fechaEntrega ? `Hoy es ${hoyISO().split("-").reverse().join("/")}` : undefined}
                />
              </Field>
              {!editing && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={ids.estado} className="text-xs font-medium text-stone-600 dark:text-stone-400">
                    Estado inicial
                  </label>
                  <select id={ids.estado} className="field-input" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
                    {ESTADOS.filter((e) => e !== "cancelado").map((e) => (
                      <option key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </fieldset>

          {/* ---------- cliente ---------- */}
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Cliente</legend>
            <div className="sm:col-span-2">
              <Field error={err("clienteNombre")}>
                <TextField label="Nombre" value={v.clienteNombre} onChange={(x) => set("clienteNombre", x)} placeholder="Ej: Juan Pérez" />
              </Field>
            </div>
            <Field error={err("clienteEmail")}>
              <TextField
                label="Email (opcional)"
                type="email"
                value={v.clienteEmail}
                onChange={(x) => set("clienteEmail", x)}
                placeholder="cliente@mail.com"
              />
            </Field>
            <TextField
              label="Teléfono / WhatsApp (opcional)"
              type="tel"
              value={v.clienteTelefono}
              onChange={(x) => set("clienteTelefono", x)}
              placeholder="Ej: 11 1234-5678"
              maxLength={40}
            />
            <div className="sm:col-span-2">
              <TextField label="Notas (opcional)" multiline maxLength={1000} value={v.notas} onChange={(x) => set("notas", x)} placeholder="Color, relleno, seña cobrada, retiro o envío…" />
            </div>
          </fieldset>

          {/* ---------- aviso (apagado mientras AVISOS_POR_MAIL sea false) ---------- */}
          {AVISOS_POR_MAIL && (
            <fieldset className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
              <legend className="px-1 text-sm font-semibold">Aviso al terminar</legend>
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5">✉️</span>
                  {isEmail(tuEmail) ? (
                    <span>
                      Te llega un mail a <span className="font-medium">{tuEmail}</span> cuando lo pases a <em>Terminado</em>.
                    </span>
                  ) : (
                    <span className="text-amber-800 dark:text-amber-300">
                      Cargá tu email en <span className="font-medium">Datos de la empresa</span> (en Presupuesto PDF) para recibir el aviso.
                    </span>
                  )}
                </li>
                <li className="flex items-start gap-2">
                  <input
                    id={ids.notify}
                    type="checkbox"
                    className="mt-1 size-4 accent-teal-700"
                    checked={clientEmailOk && v.notificarCliente}
                    disabled={!clientEmailOk}
                    onChange={(e) => set("notificarCliente", e.target.checked)}
                  />
                  <label htmlFor={ids.notify} className={clientEmailOk ? "" : "text-stone-500"}>
                    Avisarle también al cliente
                    {!clientEmailOk && <span className="block text-xs">Necesita un email válido del cliente.</span>}
                  </label>
                </li>
              </ul>
            </fieldset>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          {touched && !valid && <p className="mr-auto text-xs text-red-700 dark:text-red-400">Revisá los campos marcados.</p>}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear pedido"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className={error ? "[&_.field-input]:border-red-500 [&_.field-input]:ring-red-500/20" : undefined}>
      {children}
      {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
