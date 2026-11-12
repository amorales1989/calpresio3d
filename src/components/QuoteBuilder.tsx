import { useEffect, useMemo, useState } from "react";
import { formatMoney, round2, sanitize } from "../lib/calc";
import { CURRENCY_SYMBOLS, type Currency } from "../lib/data";
import { newId, type Product } from "../lib/model";
import {
  DEFAULT_VALID_DAYS,
  billableLines,
  lineSubtotal,
  normalizeBusiness,
  quoteTotal,
  type BusinessInfo,
  type Quote,
  type QuoteLine,
} from "../lib/quote";
import { KEYS, readJSON, readString, writeJSON, writeString } from "../lib/storage";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";

export interface QuoteSource {
  key: string; // "current" o id de producto
  label: string;
  description: string;
  unitPrice: number;
}

interface Props {
  currency: Currency;
  current: QuoteSource | null; // pieza que está en la calculadora
  products: Product[];
  initialKeys: string[]; // fuentes que arrancan agregadas
  onClose: () => void;
  onDone: (msg: string, kind?: "ok" | "error") => void;
}

const lineFrom = (s: QuoteSource): QuoteLine => ({
  id: newId(),
  description: s.description,
  quantity: 1,
  unitPrice: round2(s.unitPrice),
});

function nextQuoteNumber(): number {
  const n = Math.floor(sanitize(Number(readString(KEYS.quoteSeq))));
  return n > 0 ? n : 1;
}

export function QuoteBuilder({ currency, current, products, initialKeys, onClose, onDone }: Props) {
  const symbol = CURRENCY_SYMBOLS[currency];
  const money = (n: number) => formatMoney(n, symbol);

  // Solo se pueden sumar productos en la misma moneda del presupuesto
  const sources = useMemo<QuoteSource[]>(() => {
    const list = products
      .filter((p) => p.profile.currency === currency)
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((p) => ({ key: p.id, label: p.name, description: p.name, unitPrice: p.results.total }));
    return current ? [current, ...list] : list;
  }, [products, currency, current]);
  const otherCurrency = products.length - (sources.length - (current ? 1 : 0));

  const [business, setBusiness] = useState<BusinessInfo>(() => normalizeBusiness(readJSON<unknown>(KEYS.business, null)));
  const [number, setNumber] = useState(nextQuoteNumber);
  const [validDays, setValidDays] = useState(DEFAULT_VALID_DAYS);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>(() =>
    initialKeys.map((k) => sources.find((s) => s.key === k)).filter((s): s is QuoteSource => !!s).map(lineFrom),
  );
  const [busy, setBusy] = useState(false);

  // Los datos del negocio se guardan en el navegador a medida que se escriben
  useEffect(() => {
    writeJSON(KEYS.business, business);
  }, [business]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setLine = (id: string, patch: Partial<QuoteLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  function addSource(key: string) {
    if (key === "free") {
      setLines((ls) => [...ls, { id: newId(), description: "", quantity: 1, unitPrice: 0 }]);
      return;
    }
    const s = sources.find((x) => x.key === key);
    if (s) setLines((ls) => [...ls, lineFrom(s)]);
  }

  const total = quoteTotal(lines);
  const canExport = billableLines(lines).length > 0 && !busy;

  async function exportPdf() {
    const quote: Quote = {
      number,
      date: new Date().toISOString(),
      validDays,
      currency,
      business,
      clientName,
      clientContact,
      lines,
      notes,
    };
    setBusy(true);
    try {
      const { downloadQuotePdf } = await import("../lib/quotePdf");
      downloadQuotePdf(quote);
      writeString(KEYS.quoteSeq, String(Math.floor(number) + 1));
      onDone("Presupuesto descargado.");
      onClose();
    } catch {
      onDone("No se pudo generar el PDF.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:rounded-2xl dark:border-stone-800 dark:bg-stone-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <div>
            <h2 id="quote-title" className="text-base font-semibold">
              Presupuesto para el cliente
            </h2>
            <p className="text-xs text-stone-500">Solo se muestran precios de venta, nunca tus costos.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* ---------- ítems ---------- */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Ítems</legend>
            {lines.length === 0 && (
              <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 dark:border-stone-700">
                Agregá la pieza actual, productos guardados o un ítem libre (envío, diseño, pintura…).
              </p>
            )}
            {lines.map((l, i) => (
              <div key={l.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <div className="flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <label htmlFor={`desc-${l.id}`} className="text-xs font-medium text-stone-600 dark:text-stone-400">
                      Descripción
                    </label>
                    <input
                      id={`desc-${l.id}`}
                      className="field-input"
                      maxLength={120}
                      placeholder="Ej: Envío a domicilio"
                      value={l.description}
                      autoFocus={i === lines.length - 1 && !l.description}
                      onChange={(e) => setLine(l.id, { description: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-ghost mb-0.5 text-red-700 hover:text-red-800 dark:text-red-400"
                    onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                    aria-label={`Quitar ${l.description || "ítem"}`}
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <NumberField label="Cantidad" value={l.quantity} step={1} onChange={(v) => setLine(l.id, { quantity: v })} />
                  <NumberField
                    label="Precio unitario"
                    prefix={symbol}
                    value={l.unitPrice}
                    onChange={(v) => setLine(l.id, { unitPrice: v })}
                  />
                  <div className="col-span-2 flex items-end justify-end pb-2 text-sm tabular-nums sm:col-span-1">
                    <span className="text-stone-500">Subtotal&nbsp;</span>
                    <span className="font-semibold">{money(lineSubtotal(l))}</span>
                  </div>
                </div>
              </div>
            ))}
            <select
              className="field-input"
              aria-label="Agregar ítem"
              value=""
              onChange={(e) => addSource(e.target.value)}
            >
              <option value="" disabled>
                + Agregar ítem…
              </option>
              {current && <option value={current.key}>{current.label}</option>}
              {sources.some((s) => s.key !== current?.key) && (
                <optgroup label="Mis productos">
                  {sources
                    .filter((s) => s.key !== current?.key)
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} — {money(s.unitPrice)}
                      </option>
                    ))}
                </optgroup>
              )}
              <option value="free">Ítem libre (envío, diseño…)</option>
            </select>
            {otherCurrency > 0 && (
              <p className="text-xs text-stone-500">
                {otherCurrency} producto(s) en otra moneda no se listan: el presupuesto va en {currency}.
              </p>
            )}
            <div className="flex items-baseline justify-between rounded-xl bg-teal-700 px-4 py-3 text-white dark:bg-teal-500 dark:text-stone-950">
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Total</span>
              <span className="text-xl font-bold tabular-nums">{money(total)}</span>
            </div>
          </fieldset>

          {/* ---------- cliente ---------- */}
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Cliente</legend>
            <TextField label="Nombre" value={clientName} onChange={setClientName} placeholder="Ej: Juan Pérez" />
            <TextField label="Contacto (opcional)" value={clientContact} onChange={setClientContact} placeholder="Teléfono o email" />
          </fieldset>

          {/* ---------- presupuesto ---------- */}
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-sm font-semibold">Datos del presupuesto</legend>
            <NumberField label="Número" value={number} step={1} onChange={(v) => setNumber(Math.max(1, Math.floor(v)))} />
            <NumberField label="Validez" suffix="días" value={validDays} step={1} onChange={(v) => setValidDays(Math.floor(v))} />
            <div className="col-span-2">
              <TextField
                label="Observaciones (opcional)"
                value={notes}
                onChange={setNotes}
                multiline
                placeholder="Ej: Seña del 50 % para comenzar. Entrega en 5 días hábiles."
              />
            </div>
          </fieldset>

          {/* ---------- negocio ---------- */}
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Datos de la empresa</legend>
            <p className="-mt-1 text-xs text-stone-500 sm:col-span-2">
              Aparecen en el encabezado del PDF y quedan guardados en este navegador.
            </p>
            <TextField
              label="Nombre del negocio"
              value={business.name}
              onChange={(name) => setBusiness((b) => ({ ...b, name }))}
              placeholder="Ej: Impresiones 3D Morales"
            />
            <TextField
              label="Teléfono / WhatsApp"
              type="tel"
              value={business.phone}
              onChange={(phone) => setBusiness((b) => ({ ...b, phone }))}
              placeholder="Ej: 11 1234-5678"
            />
            <TextField
              label="Email"
              type="email"
              value={business.email}
              onChange={(email) => setBusiness((b) => ({ ...b, email }))}
              placeholder="Ej: hola@minegocio.com"
            />
            <TextField
              label="Instagram"
              prefix="@"
              value={business.instagram}
              onChange={(instagram) => setBusiness((b) => ({ ...b, instagram: instagram.replace(/^@+/, "") }))}
              placeholder="mi_negocio"
            />
          </fieldset>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={!canExport} onClick={exportPdf}>
            {busy ? "Generando…" : "Descargar PDF"}
          </button>
        </footer>
      </div>
    </div>
  );
}
