import { useEffect, useId, useState, type ReactNode } from "react";
import { sanitize } from "../lib/calc";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number | string;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
}

const toText = (n: number) => String(n);

/**
 * Input numérico con validación suave:
 * - no permite negativos ni notación exponencial
 * - si queda vacío vale 0 (y al salir del campo muestra 0)
 * - mantiene el texto local para no pelearse con lo que se está tipeando ("2.", "0,")
 */
export function NumberField({ label, value, onChange, step = "any", prefix, suffix, hint, disabled, placeholder }: Props) {
  const id = useId();
  const [text, setText] = useState(() => toText(value));

  // Sincronizar cuando el valor cambia desde afuera (cambio de perfil, moneda, cargar producto…)
  useEffect(() => {
    setText((prev) => (sanitize(prev === "" ? 0 : Number(prev)) === value ? prev : toText(value)));
  }, [value]);

  function handleChange(raw: string) {
    const cleaned = raw.replace(/-/g, "");
    setText(cleaned);
    onChange(cleaned === "" ? 0 : sanitize(Number(cleaned)));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-stone-600 dark:text-stone-400">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 text-xs text-stone-400">{prefix}</span>
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={text}
          disabled={disabled}
          placeholder={placeholder ?? "0"}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            if (text === "" || !Number.isFinite(Number(text))) setText("0");
          }}
          onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
          }}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className="field-input"
          style={{
            paddingLeft: prefix ? `${0.75 + prefix.length * 0.5}rem` : undefined,
            paddingRight: suffix ? `${0.75 + suffix.length * 0.5}rem` : undefined,
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 text-xs text-stone-400">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-stone-500 dark:text-stone-500">{hint}</p>}
    </div>
  );
}
