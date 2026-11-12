import { useState } from "react";
import { formatMoney, type CostResult } from "../lib/calc";

interface Props {
  results: CostResult;
  symbol: string;
  multiplier: number;
  profileName: string;
  onSaveProduct: (name: string) => void;
}

function formatHours(h: number) {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h ${mm.toString().padStart(2, "0")} min`;
}

export function ResultsPanel({ results: r, symbol, multiplier, profileName, onSaveProduct }: Props) {
  const money = (n: number) => formatMoney(n, symbol);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const rows: [string, number, string?][] = [
    ["Precio material", r.material],
    ["Precio luz", r.luz],
    ["Desgaste máquina", r.desgaste],
    ["Margen de error", r.error],
  ];

  function submit() {
    const n = name.trim();
    if (!n) return;
    onSaveProduct(n);
    setName("");
    setSaving(false);
  }

  return (
    <aside className="card lg:sticky lg:top-6" aria-live="polite">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Resultados</h2>
        <span className="truncate text-xs text-stone-500" title={profileName}>
          {formatHours(r.horas)} · {profileName}
        </span>
      </div>

      <dl className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
            <dd className="tabular-nums">{money(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-2.5 font-semibold">
          <dt>Costo total (sin insumos)</dt>
          <dd className="tabular-nums">{money(r.costo)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-stone-600 dark:text-stone-400">Insumos (+30%)</dt>
          <dd className="tabular-nums">{money(r.insumos)}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl bg-teal-700 p-4 text-white dark:bg-teal-500 dark:text-stone-950">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide opacity-80">
          <span>Total a cobrar</span>
          <span className="tabular-nums">×{multiplier.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="mt-1 break-all text-3xl font-bold tabular-nums">{money(r.total)}</div>
      </div>

      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          <span>Precio MercadoLibre</span>
          <span className="normal-case tracking-normal opacity-80">×{(multiplier + 0.8).toLocaleString("es-AR", { maximumFractionDigits: 2 })} por comisiones</span>
        </div>
        <div className="mt-1 break-all text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-200">{money(r.precioML)}</div>
      </div>

      <div className="mt-5">
        {saving ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="product-name" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Nombre del producto
            </label>
            <input
              id="product-name"
              autoFocus
              className="field-input"
              placeholder="Ej: Soporte de auriculares"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSaving(false)}
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={!name.trim()}>
                Guardar
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSaving(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setSaving(true)}>
            Guardar como producto
          </button>
        )}
      </div>
    </aside>
  );
}
