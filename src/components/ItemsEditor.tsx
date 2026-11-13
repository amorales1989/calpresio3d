// Lista de ítems para pedidos y presupuestos: productos guardados (solo se cambia la cantidad,
// con opción de editar el precio) e ítems libres (envío, diseño…) que se editan enteros.
import { useMemo, useState } from "react";
import { formatMoney, sanitize } from "../lib/calc";
import { CURRENCY_SYMBOLS, type Currency } from "../lib/data";
import { agregarProducto, itemLibre, precioProducto, subtotalItem, type Item } from "../lib/items";
import type { Product } from "../lib/model";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";

/** Opción extra del selector (ej. la pieza que está en la calculadora). */
export interface ItemExtra {
  key: string;
  label: string;
  crear: () => Item;
}

interface Props {
  items: Item[];
  onChange: (items: Item[]) => void;
  products: Product[];
  currency: Currency;
  extras?: ItemExtra[];
  error?: string;
}

export function ItemsEditor({ items, onChange, products, currency, extras = [], error }: Props) {
  const symbol = CURRENCY_SYMBOLS[currency];
  const money = (n: number) => formatMoney(n, symbol);
  // Productos con el precio desbloqueado a mano (los que ya tienen otro precio se abren solos)
  const [editandoPrecio, setEditandoPrecio] = useState<Set<string>>(() => new Set());

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const disponibles = useMemo(
    () => products.filter((p) => p.profile.currency === currency).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products, currency],
  );
  const otraMoneda = products.length - disponibles.length;

  const set = (id: string, patch: Partial<Item>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const quitar = (id: string) => onChange(items.filter((i) => i.id !== id));

  function agregar(key: string) {
    if (key === "libre") return onChange([...items, itemLibre()]);
    const extra = extras.find((x) => x.key === key);
    if (extra) return onChange([...items, extra.crear()]);
    const p = byId.get(key);
    if (p) onChange(agregarProducto(items, p));
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 dark:border-stone-700">
          Elegí tus productos guardados abajo, o agregá un ítem libre (envío, diseño, pintura…).
        </p>
      )}

      {items.map((it, idx) => {
        const prod = it.productoId ? byId.get(it.productoId) : undefined;
        const precioOriginal = prod ? precioProducto(prod) : null;
        const modificado = precioOriginal !== null && Math.abs(precioOriginal - it.precioUnitario) > 0.004;
        const precioAbierto = editandoPrecio.has(it.id) || modificado;

        return (
          <div key={it.id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
            {it.productoId ? (
              // ---------- producto guardado ----------
              <>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.descripcion}</div>
                    {it.detalle && <div className="truncate text-xs text-stone-500">{it.detalle}</div>}
                  </div>
                  <QuitarBtn onClick={() => quitar(it.id)} label={it.descripcion} />
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <Cantidad value={it.cantidad} onChange={(cantidad) => set(it.id, { cantidad })} label={it.descripcion} />
                  {precioAbierto ? (
                    <div className="w-36">
                      <NumberField
                        label="Precio unitario"
                        prefix={symbol}
                        value={it.precioUnitario}
                        onChange={(precioUnitario) => set(it.id, { precioUnitario })}
                        hint={
                          modificado && precioOriginal !== null ? (
                            <button
                              type="button"
                              className="text-teal-700 underline dark:text-teal-400"
                              onClick={() => {
                                set(it.id, { precioUnitario: precioOriginal });
                                setEditandoPrecio((s) => new Set([...s].filter((x) => x !== it.id)));
                              }}
                            >
                              Volver a {money(precioOriginal)}
                            </button>
                          ) : undefined
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 pb-1.5 text-sm">
                      <span className="tabular-nums text-stone-600 dark:text-stone-400">{money(it.precioUnitario)} c/u</span>
                      <button
                        type="button"
                        className="self-start text-xs text-teal-700 underline dark:text-teal-400"
                        onClick={() => setEditandoPrecio((s) => new Set(s).add(it.id))}
                      >
                        Editar precio
                      </button>
                    </div>
                  )}
                  <Subtotal value={money(subtotalItem(it))} />
                </div>
              </>
            ) : (
              // ---------- ítem libre ----------
              <>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField
                      label="Descripción"
                      value={it.descripcion}
                      maxLength={200}
                      placeholder="Ej: Envío a domicilio"
                      autoFocus={idx === items.length - 1 && !it.descripcion}
                      onChange={(descripcion) => set(it.id, { descripcion })}
                    />
                  </div>
                  <QuitarBtn onClick={() => quitar(it.id)} label={it.descripcion || "ítem"} />
                </div>
                <div className="mt-2">
                  <TextField
                    label="Detalle para el cliente (opcional)"
                    value={it.detalle}
                    maxLength={300}
                    placeholder="Ej: Material: PLA negro · 12 × 8 cm"
                    onChange={(detalle) => set(it.id, { detalle })}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <Cantidad value={it.cantidad} onChange={(cantidad) => set(it.id, { cantidad })} label={it.descripcion || "ítem"} />
                  <div className="w-36">
                    <NumberField label="Precio unitario" prefix={symbol} value={it.precioUnitario} onChange={(precioUnitario) => set(it.id, { precioUnitario })} />
                  </div>
                  <Subtotal value={money(subtotalItem(it))} />
                </div>
              </>
            )}
          </div>
        );
      })}

      <select className="field-input" aria-label="Agregar producto o ítem" value="" onChange={(e) => agregar(e.target.value)}>
        <option value="" disabled>
          + Agregar producto…
        </option>
        {extras.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
          </option>
        ))}
        {disponibles.length > 0 && (
          <optgroup label="Mis productos">
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.material.trim() ? `${p.name} (${p.material.trim()})` : p.name} — {money(precioProducto(p))}
              </option>
            ))}
          </optgroup>
        )}
        <option value="libre">Ítem libre (envío, diseño…)</option>
      </select>
      {disponibles.length === 0 && products.length === 0 && (
        <p className="text-xs text-stone-500">Todavía no tenés productos guardados: se guardan desde la Calculadora.</p>
      )}
      {otraMoneda > 0 && (
        <p className="text-xs text-stone-500">
          {otraMoneda} producto(s) en otra moneda no se listan: este va en {currency}.
        </p>
      )}
      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

function Cantidad({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const n = Math.floor(sanitize(value));
  const btn =
    "flex size-10 items-center justify-center rounded-lg border border-stone-300 text-lg font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Cantidad</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={() => onChange(Math.max(1, n - 1))} disabled={n <= 1} aria-label={`Una menos de ${label}`}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={`Cantidad de ${label}`}
          className="field-input w-16 text-center tabular-nums"
          value={n || ""}
          onChange={(e) => onChange(Math.floor(sanitize(Number(e.target.value))))}
          onBlur={() => n < 1 && onChange(1)}
          onKeyDown={(e) => ["-", "e", "E", "+", ".", ","].includes(e.key) && e.preventDefault()}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
        />
        <button type="button" className={btn} onClick={() => onChange(n + 1)} aria-label={`Una más de ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function Subtotal({ value }: { value: string }) {
  return (
    <div className="ml-auto pb-2 text-right text-sm tabular-nums">
      <span className="text-stone-500">Subtotal&nbsp;</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function QuitarBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="btn-ghost text-xs text-red-700 hover:text-red-800 dark:text-red-400" onClick={onClick} aria-label={`Quitar ${label}`}>
      Quitar
    </button>
  );
}
