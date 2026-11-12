import { useId } from "react";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  type = "text",
  prefix,
  maxLength,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "tel" | "email" | "date";
  prefix?: string;
  maxLength?: number;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-stone-600 dark:text-stone-400">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          maxLength={maxLength ?? 600}
          className="field-input resize-y"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="relative flex items-center">
          {prefix && <span className="pointer-events-none absolute left-3 text-sm text-stone-400">{prefix}</span>}
          <input
            id={id}
            type={type}
            className={`field-input ${prefix ? "pl-7" : ""}`}
            maxLength={maxLength ?? 120}
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
