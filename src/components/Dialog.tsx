import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface DialogAction<T> {
  label: string;
  value: T;
  variant?: "primary" | "secondary" | "danger";
}

interface DialogRequest<T> {
  title: string;
  body?: ReactNode;
  actions: DialogAction<T>[];
  cancelValue: T;
  resolve: (v: T) => void;
}

/**
 * Diálogo propio en lugar de window.confirm (que en algunos entornos embebidos
 * devuelve false sin mostrarse). Devuelve una promesa con el valor elegido.
 */
export function useDialog() {
  const [req, setReq] = useState<DialogRequest<unknown> | null>(null);

  const ask = useCallback(
    <T,>(opts: { title: string; body?: ReactNode; actions: DialogAction<T>[]; cancelValue: T }) =>
      new Promise<T>((resolve) => {
        setReq({ ...opts, resolve: resolve as (v: unknown) => void } as DialogRequest<unknown>);
      }),
    [],
  );

  const confirm = useCallback(
    (title: string, body?: ReactNode, okLabel = "Aceptar", danger = false) =>
      ask<boolean>({
        title,
        body,
        cancelValue: false,
        actions: [
          { label: "Cancelar", value: false, variant: "secondary" },
          { label: okLabel, value: true, variant: danger ? "danger" : "primary" },
        ],
      }),
    [ask],
  );

  const close = (v: unknown) => {
    req?.resolve(v);
    setReq(null);
  };

  const element = req ? <DialogView req={req} onClose={close} /> : null;
  return { ask, confirm, element };
}

function DialogView({ req, onClose }: { req: DialogRequest<unknown>; onClose: (v: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = ref.current?.querySelector<HTMLButtonElement>("[data-default]");
    last?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(req.cancelValue);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, onClose]);

  const cls = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger" } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose(req.cancelValue)}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="dialog-title" className="text-base font-semibold">
          {req.title}
        </h2>
        {req.body && <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">{req.body}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {req.actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              className={cls[a.variant ?? "secondary"]}
              data-default={i === req.actions.length - 1 ? "" : undefined}
              onClick={() => onClose(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
