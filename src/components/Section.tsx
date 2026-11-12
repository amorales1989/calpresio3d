import type { ReactNode } from "react";

export function Section({
  step,
  title,
  description,
  actions,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-700/10 text-xs font-semibold text-teal-800 dark:bg-teal-400/10 dark:text-teal-300">
            {step}
          </span>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
          </div>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
