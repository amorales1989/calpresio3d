import { useRef, useState } from "react";

/** Muestra el JSON exportado con opciones para copiarlo o descargarlo. */
export function ExportPanel({ json, filename, counts }: { json: string; filename: string; counts: [number, number] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Copiado al portapapeles.");
    } catch {
      ref.current?.select();
      setStatus("No se pudo copiar solo: el texto quedó seleccionado, copialo con Ctrl+C / Cmd+C.");
    }
  }

  function download() {
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Si no se descargó, usá Copiar y pegalo en un archivo .json.");
    } catch {
      setStatus("No se pudo descargar. Usá Copiar y pegalo en un archivo .json.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        {counts[0]} perfil(es) y {counts[1]} producto(s). Guardalo como respaldo o para pasarlo a otro navegador con
        “Importar JSON”.
      </p>
      <textarea
        ref={ref}
        readOnly
        value={json}
        aria-label="Datos exportados en JSON"
        className="field-input h-40 resize-none font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={copy}>
          Copiar
        </button>
        <button type="button" className="btn-secondary" onClick={download}>
          Descargar .json
        </button>
      </div>
      {status && <p className="text-xs text-teal-800 dark:text-teal-300" role="status">{status}</p>}
    </div>
  );
}
