import { useState } from "react";
import type { ProductInfo } from "../lib/model";
import { TextField } from "./TextField";

/** Nombre, material y detalle de un producto: al guardarlo desde Resultados y al editarlo en Mis productos. */
export function ProductInfoForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ProductInfo;
  submitLabel: string;
  onSubmit: (info: ProductInfo) => void;
  onCancel: () => void;
}) {
  const [info, setInfo] = useState<ProductInfo>(initial ?? { name: "", material: "", description: "" });
  const set = (k: keyof ProductInfo) => (v: string) => setInfo((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!info.name.trim()) return;
        onSubmit({ name: info.name.trim(), material: info.material.trim(), description: info.description.trim() });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <TextField label="Nombre del producto" value={info.name} onChange={set("name")} maxLength={80} placeholder="Ej: Soporte de auriculares" autoFocus />
      <TextField label="Material" value={info.material} onChange={set("material")} maxLength={60} placeholder="Ej: PLA negro, PETG transparente" />
      <TextField
        label="Detalle para el cliente (opcional)"
        value={info.description}
        onChange={set("description")}
        maxLength={140}
        placeholder="Ej: 12 × 8 cm, con logo grabado"
        hint="El material y el detalle aparecen en el presupuesto; los costos no."
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={!info.name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
