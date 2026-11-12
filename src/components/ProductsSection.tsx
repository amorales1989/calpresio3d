import { useMemo, useRef, useState } from "react";
import { formatMoney } from "../lib/calc";
import { CURRENCY_SYMBOLS } from "../lib/data";
import type { Product, ProductInfo } from "../lib/model";
import { ProductInfoForm } from "./ProductInfoForm";
import { Section } from "./Section";

interface Props {
  products: Product[];
  onLoad: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  onUpdate: (id: string, info: ProductInfo) => void;
  onDelete: (p: Product) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onQuote: (p: Product | null) => void;
  onPedido: (p: Product) => void;
}

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ProductsSection({ products, onLoad, onDuplicate, onUpdate, onDelete, onExport, onImport, onQuote, onPedido }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return list;
    return list.filter((p) => normalize(`${p.name} ${p.material} ${p.description} ${p.profile.name}`).includes(q));
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
                const money = (n: number) => formatMoney(n, sym);
                if (editingId === p.id) {
                  return (
                    <li key={p.id} className="py-4">
                      <ProductInfoForm
                        initial={p}
                        submitLabel="Guardar cambios"
                        onSubmit={(info) => {
                          onUpdate(p.id, info);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={p.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium break-words">{p.name}</span>
                        {p.material.trim() ? (
                          <span className="rounded-full bg-teal-700/10 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-400/10 dark:text-teal-300">
                            {p.material}
                          </span>
                        ) : (
                          <button type="button" className="text-xs text-stone-500 underline" onClick={() => setEditingId(p.id)}>
                            + material
                          </button>
                        )}
                      </div>
                      {p.description.trim() && <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{p.description}</p>}
                      <div className="mt-1 text-xs text-stone-500">
                        {p.piece.grams} g · {p.piece.hours} h {p.piece.minutes} min · {p.profile.name} · {dateFmt.format(new Date(p.createdAt))}
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs tabular-nums sm:max-w-md">
                        <div>
                          <dt className="text-stone-500">Costo</dt>
                          <dd className="font-medium">{money(p.results.costo + p.results.insumos)}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Precio (×{p.piece.profitMultiplier.toLocaleString("es-AR")})</dt>
                          <dd className="font-semibold text-teal-800 dark:text-teal-300">{money(p.results.total)}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">MercadoLibre</dt>
                          <dd className="font-medium">{money(p.results.precioML)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="grid shrink-0 grid-cols-3 gap-1 lg:flex lg:flex-wrap lg:justify-end">
                      <button type="button" className="btn-secondary px-2 text-xs" onClick={() => onQuote(p)}>
                        Presupuestar
                      </button>
                      <button type="button" className="btn-secondary px-2 text-xs" onClick={() => onPedido(p)}>
                        Pedido
                      </button>
                      <button type="button" className="btn-secondary px-2 text-xs" onClick={() => setEditingId(p.id)}>
                        Editar
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => onLoad(p)}>
                        Cargar
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
