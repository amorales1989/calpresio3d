import { useEffect, useMemo, useState } from "react";
import { formatMoney, round2, sanitize } from "../lib/calc";
import { CURRENCY_SYMBOLS, type Currency } from "../lib/data";
import { itemDesdeProducto, itemLibre, type Item } from "../lib/items";
import type { Product } from "../lib/model";
import {
  DEFAULT_VALID_DAYS,
  billableLines,
  businessContactLines,
  quoteTotal,
  type BusinessInfo,
  type Quote,
  type QuoteLine,
} from "../lib/quote";
import { ItemsEditor, type ItemExtra } from "./ItemsEditor";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";

export interface QuoteSource {
  key: string; // "current" o id de producto
  label: string;
  description: string;
  detail: string;
  unitPrice: number;
}

interface Props {
  currency: Currency;
  current: QuoteSource | null; // pieza que está en la calculadora
  products: Product[];
  initialKeys: string[]; // fuentes que arrancan agregadas
  business: BusinessInfo;
  onBusinessChange: (b: BusinessInfo) => void;
  nextNumber: number;
  /** Después de descargar: el próximo presupuesto arranca en `n + 1`. */
  onNumberUsed: (n: number) => void;
  onClose: () => void;
  onDone: (msg: string, kind?: "ok" | "error") => void;
}

const toLine = (i: Item): QuoteLine => ({
  id: i.id,
  description: i.descripcion,
  detail: i.detalle,
  quantity: i.cantidad,
  unitPrice: i.precioUnitario,
});

export function QuoteBuilder({ currency, current, products, initialKeys, business, onBusinessChange, nextNumber, onNumberUsed, onClose, onDone }: Props) {
  const symbol = CURRENCY_SYMBOLS[currency];
  const money = (n: number) => formatMoney(n, symbol);

  const fromCurrent = (s: QuoteSource): Item =>
    itemLibre({ descripcion: s.description, detalle: s.detail, precioUnitario: round2(s.unitPrice) });
  const extras = useMemo<ItemExtra[]>(
    () => (current ? [{ key: current.key, label: current.label, crear: () => fromCurrent(current) }] : []),
    [current],
  );

  const setBusiness = (fn: (b: BusinessInfo) => BusinessInfo) => onBusinessChange(fn(business));
  const [number, setNumber] = useState(() => Math.max(1, Math.floor(sanitize(nextNumber))));
  const [validDays, setValidDays] = useState(DEFAULT_VALID_DAYS);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>(() =>
    initialKeys.flatMap((k) => {
      if (current && k === current.key) return [fromCurrent(current)];
      const p = products.find((x) => x.id === k && x.profile.currency === currency);
      return p ? [itemDesdeProducto(p)] : [];
    }),
  );
  const lines = useMemo(() => items.map(toLine), [items]);
  const [busy, setBusy] = useState(false);
  // Si la empresa ya está cargada se muestra resumida; si no, el formulario abierto
  const [editingBusiness, setEditingBusiness] = useState(() => !business.name.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      onNumberUsed(Math.floor(number));
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
          {/* ---------- negocio ---------- */}
          {!editingBusiness ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3 dark:bg-stone-800/50">
              <div className="min-w-0 text-sm">
                <div className="text-xs font-medium text-stone-500">Datos de la empresa</div>
                <div className="truncate font-semibold">{business.name}</div>
                <div className="truncate text-xs text-stone-500">{businessContactLines(business).join(" · ")}</div>
              </div>
              <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => setEditingBusiness(true)}>
                Editar
              </button>
            </div>
          ) : (
            <fieldset className="grid grid-cols-1 gap-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-2 dark:bg-stone-800/50">
              <legend className="sr-only">Datos de la empresa</legend>
              <div className="sm:col-span-2">
                <div className="text-sm font-semibold">Datos de la empresa</div>
                <p className="text-xs text-stone-500">Aparecen en el encabezado del PDF y quedan guardados en este navegador.</p>
              </div>
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
              {business.name.trim() && (
                <div className="flex justify-end sm:col-span-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setEditingBusiness(false)}>
                    Listo
                  </button>
                </div>
              )}
            </fieldset>
          )}

          {/* ---------- ítems ---------- */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Ítems</legend>
            <ItemsEditor items={items} onChange={setItems} products={products} currency={currency} extras={extras} />
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
