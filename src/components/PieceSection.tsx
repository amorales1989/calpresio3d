import { useEffect, useState } from "react";
import { sanitize } from "../lib/calc";
import { MULTIPLIER_PRESETS } from "../lib/data";
import type { Piece } from "../lib/model";
import { NumberField } from "./NumberField";
import { Section } from "./Section";

interface Props {
  piece: Piece;
  symbol: string;
  onChange: (p: Piece) => void;
  onReset: () => void;
}

const fmtMult = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function PieceSection({ piece, symbol, onChange, onReset }: Props) {
  const set = <K extends keyof Piece>(key: K, value: Piece[K]) => onChange({ ...piece, [key]: value });
  const isPreset = MULTIPLIER_PRESETS.some((m) => m.value === piece.profitMultiplier);

  const [customText, setCustomText] = useState(isPreset ? "" : String(piece.profitMultiplier));
  useEffect(() => {
    // si se eligió un botón (o se cargó un producto con preset), vaciar el personalizado
    if (isPreset) setCustomText("");
    else setCustomText((prev) => (Number(prev) === piece.profitMultiplier ? prev : String(piece.profitMultiplier)));
  }, [piece.profitMultiplier, isPreset]);

  return (
    <Section
      step={2}
      title="Pieza"
      description="Datos que te da el slicer."
      actions={
        <button type="button" className="btn-ghost text-xs" onClick={onReset}>
          Limpiar
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField label="Horas" suffix="h" step={1} value={piece.hours} onChange={(v) => set("hours", v)} />
        <NumberField label="Minutos" suffix="min" step={1} value={piece.minutes} onChange={(v) => set("minutes", v)} />
        <NumberField label="Peso" suffix="g" step={1} value={piece.grams} onChange={(v) => set("grams", v)} />
        <NumberField label="Insumos extra" prefix={symbol} step={100} value={piece.insumos} onChange={(v) => set("insumos", v)} hint="Imanes, pintura, packaging…" />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-stone-600 dark:text-stone-400">Multiplicador de ganancia</p>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Multiplicador de ganancia">
          {MULTIPLIER_PRESETS.map((m) => {
            const active = piece.profitMultiplier === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                title={m.label}
                onClick={() => set("profitMultiplier", m.value)}
                className={`btn min-w-14 tabular-nums ${
                  active
                    ? "bg-teal-700 text-white dark:bg-teal-500 dark:text-stone-950"
                    : "border border-stone-300 bg-white text-stone-800 hover:border-teal-600 hover:text-teal-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-teal-400 dark:hover:text-teal-300"
                }`}
              >
                ×{fmtMult(m.value)}
              </button>
            );
          })}
          <div className="relative w-36">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">×</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              aria-label="Multiplicador personalizado"
              placeholder="Personalizado"
              value={customText}
              onChange={(e) => {
                const raw = e.target.value.replace(/-/g, "");
                setCustomText(raw);
                if (raw !== "") set("profitMultiplier", sanitize(Number(raw)));
              }}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
              }}
              className={`field-input pl-7 ${!isPreset ? "border-teal-600 ring-2 ring-teal-600/20 dark:border-teal-400" : ""}`}
            />
          </div>
        </div>

        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-stone-500 sm:grid-cols-2">
          {MULTIPLIER_PRESETS.map((m) => (
            <li key={m.value}>
              <span className="font-medium tabular-nums text-stone-700 dark:text-stone-300">×{fmtMult(m.value)}</span> {m.label}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
