import { useMemo, useRef, useState } from "react";
import { formatMoney } from "../lib/calc";
import { CURRENCY_SYMBOLS } from "../lib/data";
import type { Product } from "../lib/model";
import { Section } from "./Section";

interface Props {
  products: Product[];
  onLoad: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  onDelete: (p: Product) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onQuote: (p: Product | null) => void;
  onPedido: (p: Product) => void;
}

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ProductsSection({ products, onLoad, onDuplicate, onDelete, onExport, onImport, onQuote, onPedido }: Props) {
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return list;
    return list.filter((p) => normalize(`${p.name} ${p.profile.name}`).includes(q));
  }, [products, query]);

  return (
    <Section
      step={3}
      title="Mis productos"
      description="Piezas guardadas con su costo y el perfil que usaste."
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-xs" onClick={() => onQuote(null)}>
            Presupuesto PDF
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={onExport}>
            Exportar JSON
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={() => fileRef.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      }
    >
      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">
          Todavía no guardaste productos. Calculá una pieza y tocá <span className="font-medium">“Guardar como producto”</span>.
        </p>
      ) : (
        <>
          <input
            type="search"
            className="field-input mb-3"
            placeholder={`Buscar entre ${products.length} producto${products.length === 1 ? "" : "s"}…`}
            aria-label="Buscar productos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">No hay productos que coincidan con “{query}”.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.map((p) => {
                const sym = CURRENCY_SYMBOLS[p.profile.currency];
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-stone-500">
                        {dateFmt.format(new Date(p.createdAt))} · {p.profile.name} · {p.piece.grams} g · {p.piece.hours} h {p.piece.minutes} min · ×
                        {p.piece.profitMultiplier.toLocaleString("es-AR")}
                      </div>
                      <div className="mt-0.5 text-sm tabular-nums">
                        <span className="font-semibold text-teal-800 dark:text-teal-300">{formatMoney(p.results.total, sym)}</span>
                        <span className="text-stone-500"> · ML {formatMoney(p.results.precioML, sym)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <button type="button" className="btn-ghost text-xs" onClick={() => onLoad(p)}>
                        Cargar
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => onQuote(p)}>
                        Presupuestar
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => onPedido(p)}>
                        Pedido
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => onDuplicate(p)}>
                        Duplicar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        onClick={() => onDelete(p)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
