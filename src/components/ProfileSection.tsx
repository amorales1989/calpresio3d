import { useState } from "react";
import { CURRENCIES, CURRENCY_DEFAULTS, CURRENCY_SYMBOLS, CUSTOM_PRINTER, PRINTER_BRANDS, PRINTER_MODELS, findPrinter, isCurrency } from "../lib/data";
import type { Profile } from "../lib/model";
import { NumberField } from "./NumberField";
import { Section } from "./Section";

interface Props {
  profiles: Profile[];
  draft: Profile;
  isSaved: boolean;
  isDirty: boolean;
  onDraftChange: (p: Profile) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function ProfileSection({ profiles, draft, isSaved, isDirty, onDraftChange, onSelect, onNew, onSave, onDelete }: Props) {
  const sym = CURRENCY_SYMBOLS[draft.currency];
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onDraftChange({ ...draft, [key]: value });
  const isCustom = draft.printerModel === CUSTOM_PRINTER;
  // Los gastos fijos casi no cambian: se muestran plegados para que en el celular la pieza y el total queden a mano
  const [open, setOpen] = useState(() => !isSaved || isDirty);
  const expanded = open || isDirty;

  return (
    <Section step={1} title="Perfil" description="Gastos fijos de tu impresora. Podés tener uno por máquina.">
      <div className="mb-5 flex flex-col gap-2 rounded-xl bg-stone-50 p-3 sm:flex-row sm:items-center dark:bg-stone-950/60">
        <label htmlFor="profile-select" className="sr-only">
          Perfil activo
        </label>
        <select
          id="profile-select"
          className="field-input sm:flex-1"
          value={draft.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === draft.id && isDirty ? " (con cambios)" : ""}
            </option>
          ))}
          {!isSaved && <option value={draft.id}>{draft.name || "Nuevo perfil"} (sin guardar)</option>}
        </select>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={onNew}>
            Nuevo
          </button>
          <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={onSave} disabled={!isDirty}>
            Guardar perfil
          </button>
          <button type="button" className="btn-danger flex-1 sm:flex-none" onClick={onDelete}>
            Eliminar
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn-ghost -mt-2 mb-3 w-full justify-between px-3 py-2 text-left"
        aria-expanded={expanded}
        onClick={() => setOpen((o) => !o)}
        disabled={isDirty}
      >
        <span className="min-w-0 truncate text-xs">
          {expanded
            ? "Ocultar gastos fijos"
            : `${sym} ${draft.priceKg.toLocaleString("es-AR")}/kg · ${draft.consumptionW} W · ${sym} ${draft.priceKwh.toLocaleString("es-AR")}/kWh · error ${draft.errorMarginPercent}%`}
        </span>
        <span className="shrink-0 text-xs font-medium text-teal-800 dark:text-teal-300">{expanded ? "▲" : "Editar ▼"}</span>
      </button>

      {expanded && (
        <>
        {isDirty && (
          <p className="-mt-2 mb-4 text-xs text-amber-700 dark:text-amber-400">
            {isSaved ? "Tenés cambios sin guardar en este perfil." : "Este perfil todavía no está guardado."} El cálculo ya los usa.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-name" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Nombre
            </label>
            <input
              id="profile-name"
              className="field-input"
              value={draft.name}
              maxLength={60}
              placeholder="Ej: Bambu A1 del taller"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-currency" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Moneda
            </label>
            <select
              id="profile-currency"
              className="field-input"
              value={draft.currency}
              onChange={(e) => {
                const c = e.target.value;
                if (!isCurrency(c)) return;
                onDraftChange({ ...draft, currency: c, ...CURRENCY_DEFAULTS[c] });
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({CURRENCY_SYMBOLS[c]})
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-500">Al cambiarla se cargan precios de referencia.</p>
          </div>

          <NumberField label="Precio del filamento por kg" prefix={sym} step={100} value={draft.priceKg} onChange={(v) => set("priceKg", v)} />
          <NumberField label="Precio del kWh" prefix={sym} step={0.01} value={draft.priceKwh} onChange={(v) => set("priceKwh", v)} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-printer" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Modelo de impresora
            </label>
            <select
              id="profile-printer"
              className="field-input"
              value={draft.printerModel}
              onChange={(e) => {
                const id = e.target.value;
                const model = findPrinter(id);
                onDraftChange({ ...draft, printerModel: id, consumptionW: model ? model.watts : draft.consumptionW });
              }}
            >
              <option value={CUSTOM_PRINTER}>Otro / Personalizado</option>
              {PRINTER_BRANDS.map((brand) => (
                <optgroup key={brand} label={brand}>
                  {PRINTER_MODELS.filter((m) => m.brand === brand).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.brand} {m.name} — {m.watts} W
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <NumberField
            label="Consumo promedio"
            suffix="W"
            step={5}
            value={draft.consumptionW}
            onChange={(v) => set("consumptionW", v)}
            disabled={!isCustom}
            hint={isCustom ? "Si no lo sabés, ~100 W." : "Lo completa el modelo. Elegí “Otro” para editarlo."}
          />

          <NumberField label="Vida útil de la máquina" suffix="h" step={10} value={draft.machineLifespanHours} onChange={(v) => set("machineLifespanHours", v)} />
          <NumberField label="Costo de repuestos" prefix={sym} step={100} value={draft.repairCosts} onChange={(v) => set("repairCosts", v)} />
          <NumberField label="Margen de error" suffix="%" step={0.5} value={draft.errorMarginPercent} onChange={(v) => set("errorMarginPercent", v)} hint="Fallas, purgas y piezas que salen mal." />

          <div className="border-t border-stone-100 pt-4 sm:col-span-2 dark:border-stone-800">
            <div className="text-sm font-semibold">Venta por MercadoLibre</div>
            <p className="text-xs text-stone-500">
              Para que el precio ML te deje lo mismo que vender directo. Revisá los valores en el simulador de costos de tu cuenta de vendedor.
            </p>
          </div>
          <NumberField
            label="Comisión de la publicación"
            suffix="%"
            step={0.5}
            value={draft.mlComisionPct}
            onChange={(v) => set("mlComisionPct", v)}
            hint="Sin IVA: se le suma 21 %. Clásica ~12-15 %, Premium ~17-20 %."
          />
          <NumberField
            label="Retención de Ingresos Brutos"
            suffix="%"
            step={0.5}
            value={draft.mlIibbPct}
            onChange={(v) => set("mlIibbPct", v)}
            hint="La que te descuenta Mercado Pago. Con monotributo unificado suele ser 0."
          />
          <NumberField label="Envío que pagás vos" prefix={sym} step={100} value={draft.mlEnvio} onChange={(v) => set("mlEnvio", v)} hint="Por venta (envío gratis)." />
          <NumberField
            label="Cargo fijo por unidad"
            prefix={sym}
            step={50}
            value={draft.mlCargoFijo}
            onChange={(v) => set("mlCargoFijo", v)}
            hint="Sin IVA: se le suma 21 %."
          />
          <NumberField
            label="Sin cargo fijo desde"
            prefix={sym}
            step={1000}
            value={draft.mlCargoFijoHasta}
            onChange={(v) => set("mlCargoFijoHasta", v)}
            hint="Desde este precio ML no cobra el cargo fijo."
          />
        </div>
        </>
      )}
    </Section>
  );
}
