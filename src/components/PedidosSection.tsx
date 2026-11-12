import { useMemo, useState } from "react";
import { formatMoney } from "../lib/calc";
import { CURRENCY_SYMBOLS } from "../lib/data";
import {
  ESTADOS,
  ESTADO_LABEL,
  contarPorEstado,
  esActivo,
  filtrarPedidos,
  formatNumeroPedido,
  hoyISO,
  ordenarPedidos,
  siguienteEstado,
  totalPedido,
  urgencia,
  type Estado,
  type FiltroEstado,
  type Pedido,
  type PedidoEvento,
} from "../lib/pedidos";
import { ESTADO_CLASS, ESTADO_DOT, EstadoBadge } from "./EstadoBadge";
import { Section } from "./Section";

interface Props {
  pedidos: Pedido[];
  local: boolean;
  onNew: () => void;
  onEdit: (p: Pedido) => void;
  onSetEstado: (p: Pedido, estado: Estado) => void;
  onReenviarAviso: (p: Pedido) => void;
  onDelete: (p: Pedido) => void;
}

const dateTimeFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" });
const fmtDia = (iso: string) => dayFmt.format(new Date(`${iso}T12:00:00`));

export function PedidosSection({ pedidos, local, onNew, onEdit, onSetEstado, onReenviarAviso, onDelete }: Props) {
  const [filtro, setFiltro] = useState<FiltroEstado>("activos");
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const conteo = useMemo(() => contarPorEstado(pedidos), [pedidos]);
  const activos = pedidos.filter((p) => esActivo(p.estado)).length;
  const hoy = hoyISO();
  const atrasados = pedidos.filter((p) => urgencia(p, hoy) === "atrasado").length;
  const lista = useMemo(() => ordenarPedidos(filtrarPedidos(pedidos, filtro, query)), [pedidos, filtro, query]);

  const chips: { key: FiltroEstado; label: string; n: number; dot?: string }[] = [
    { key: "activos", label: "Activos", n: activos },
    ...ESTADOS.map((e) => ({ key: e as FiltroEstado, label: ESTADO_LABEL[e], n: conteo[e], dot: ESTADO_DOT[e] })),
    { key: "todos", label: "Todos", n: pedidos.length },
  ];

  return (
    <Section
      step={4}
      title="Pedidos"
      description="Seguí cada pedido hasta la entrega. Al pasarlo a Terminado se avisa por mail."
      actions={
        <button type="button" className="btn-primary text-xs" onClick={onNew}>
          + Nuevo pedido
        </button>
      }
    >
      {local && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">Modo de prueba:</span> los pedidos se guardan en este navegador y los avisos por mail son
          simulados (quedan en el historial). Cuando conectemos el servidor se envían de verdad.
        </p>
      )}

      {pedidos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">
          <p>Todavía no hay pedidos.</p>
          <p className="mt-1">
            Creá uno con <span className="font-medium">“+ Nuevo pedido”</span>, desde <span className="font-medium">Resultados</span> o
            desde un producto guardado.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- resumen ---------- */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Activos" value={activos} />
            <Stat label="Imprimiendo" value={conteo.imprimiendo} />
            <Stat label="Listos para entregar" value={conteo.terminado} tone={conteo.terminado ? "ok" : undefined} />
            <Stat label="Atrasados" value={atrasados} tone={atrasados ? "bad" : undefined} />
          </div>

          {/* ---------- filtros ---------- */}
          <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filtrar por estado">
            {chips.map((c) => {
              const on = filtro === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFiltro(c.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    on
                      ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                      : "border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  {c.dot && <span className={`size-1.5 rounded-full ${c.dot}`} />}
                  {c.label}
                  <span className={`tabular-nums ${on ? "opacity-70" : "text-stone-400"}`}>{c.n}</span>
                </button>
              );
            })}
          </div>

          <input
            type="search"
            className="field-input mb-3"
            placeholder="Buscar por número, cliente, descripción, email o teléfono…"
            aria-label="Buscar pedidos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              {query ? `No hay pedidos que coincidan con “${query}”.` : "No hay pedidos en este estado."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lista.map((p) => (
                <PedidoRow
                  key={p.id}
                  p={p}
                  hoy={hoy}
                  abierto={abierto === p.id}
                  onToggle={() => setAbierto((x) => (x === p.id ? null : p.id))}
                  onEdit={() => onEdit(p)}
                  onSetEstado={(e) => onSetEstado(p, e)}
                  onReenviarAviso={() => onReenviarAviso(p)}
                  onDelete={() => onDelete(p)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  const color =
    tone === "bad"
      ? "text-red-700 dark:text-red-400"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-stone-900 dark:text-stone-100";
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-stone-800/50">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

const URG_LABEL = { atrasado: "Atrasado", hoy: "Vence hoy", pronto: "Vence pronto" } as const;
const URG_CLASS = {
  atrasado: "text-red-700 dark:text-red-400 font-semibold",
  hoy: "text-amber-700 dark:text-amber-400 font-semibold",
  pronto: "text-amber-700 dark:text-amber-400",
} as const;

function PedidoRow({
  p,
  hoy,
  abierto,
  onToggle,
  onEdit,
  onSetEstado,
  onReenviarAviso,
  onDelete,
}: {
  p: Pedido;
  hoy: string;
  abierto: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSetEstado: (e: Estado) => void;
  onReenviarAviso: () => void;
  onDelete: () => void;
}) {
  const sym = CURRENCY_SYMBOLS[p.moneda];
  const sig = siguienteEstado(p.estado);
  const urg = urgencia(p, hoy);
  const cerrado = !esActivo(p.estado);

  return (
    <li
      className={`rounded-xl border p-3 sm:p-4 ${
        urg === "atrasado"
          ? "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-stone-200 dark:border-stone-800"
      } ${cerrado ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-stone-500">{formatNumeroPedido(p.numero)}</span>
            <span className="truncate font-semibold">{p.clienteNombre}</span>
            <EstadoBadge estado={p.estado} />
          </div>
          <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
            {p.cantidad > 1 && <span className="font-medium">{p.cantidad} × </span>}
            {p.descripcion}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500">
            {p.fechaEntrega && (
              <span className={urg ? URG_CLASS[urg] : undefined}>
                Entrega {fmtDia(p.fechaEntrega)}
                {urg && ` · ${URG_LABEL[urg]}`}
              </span>
            )}
            {p.clienteTelefono && <span>☎ {p.clienteTelefono}</span>}
            {p.clienteEmail && (
              <span title={p.notificarCliente ? "Se le avisa al terminar" : "No se le avisa"}>
                {p.notificarCliente ? "✉️" : "✉"} {p.clienteEmail}
              </span>
            )}
            {p.avisoAt && <span className="text-emerald-700 dark:text-emerald-400">Avisado {dateTimeFmt.format(new Date(p.avisoAt))}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <span className="whitespace-nowrap text-base font-bold tabular-nums text-teal-800 dark:text-teal-300">
            {formatMoney(totalPedido(p), sym)}
          </span>
          <div className="flex items-center gap-1.5">
            {sig && (
              <button
                type="button"
                className={`btn whitespace-nowrap text-xs ring-1 ring-inset ${ESTADO_CLASS[sig]} hover:brightness-95`}
                onClick={() => onSetEstado(sig)}
                title={`Pasar a ${ESTADO_LABEL[sig]}`}
              >
                → {ESTADO_LABEL[sig]}
              </button>
            )}
            <select
              className="field-input min-w-0 flex-1 py-1.5 text-xs sm:w-auto sm:flex-none"
              aria-label={`Estado del pedido ${formatNumeroPedido(p.numero)}`}
              value={p.estado}
              onChange={(e) => onSetEstado(e.target.value as Estado)}
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-stone-100 pt-2 dark:border-stone-800">
        <button type="button" className="btn-ghost text-xs" onClick={onToggle} aria-expanded={abierto}>
          {abierto ? "Ocultar detalle" : "Detalle e historial"}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={onEdit}>
          Editar
        </button>
        {(p.estado === "terminado" || p.avisoAt) && (
          <button type="button" className="btn-ghost text-xs" onClick={onReenviarAviso}>
            Reenviar aviso
          </button>
        )}
        <button
          type="button"
          className="btn-ghost ml-auto text-xs text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          onClick={onDelete}
        >
          Eliminar
        </button>
      </div>

      {abierto && <Detalle p={p} />}
    </li>
  );
}

function Detalle({ p }: { p: Pedido }) {
  const sym = CURRENCY_SYMBOLS[p.moneda];
  const d = p.datosCalculo;
  return (
    <div className="mt-3 grid gap-4 rounded-lg bg-stone-50 p-3 text-sm sm:grid-cols-2 dark:bg-stone-800/40">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Detalle</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-stone-500">Precio unitario</dt>
          <dd className="tabular-nums">{formatMoney(p.precioUnitario, sym)}</dd>
          <dt className="text-stone-500">Origen</dt>
          <dd>
            {p.origen.tipo === "producto"
              ? `Producto “${p.origen.nombre}”`
              : p.origen.tipo === "calculadora"
                ? "Calculadora"
                : "Carga manual"}
          </dd>
          {d && (
            <>
              <dt className="text-stone-500">Pieza</dt>
              <dd>
                {d.piece.grams} g · {d.piece.hours} h {d.piece.minutes} min · {d.profile.name}
              </dd>
              <dt className="text-stone-500">Costo unitario</dt>
              <dd className="tabular-nums">
                {formatMoney(d.results.costo, CURRENCY_SYMBOLS[d.profile.currency])}{" "}
                <span className="text-stone-500">(solo lo ves vos)</span>
              </dd>
            </>
          )}
          <dt className="text-stone-500">Creado</dt>
          <dd>{dateTimeFmt.format(new Date(p.creadoAt))}</dd>
        </dl>
        {p.notas && <p className="whitespace-pre-wrap rounded-md bg-white p-2 text-xs dark:bg-stone-900">{p.notas}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Historial</h3>
        <ol className="flex flex-col gap-2 border-l border-stone-200 pl-3 dark:border-stone-700">
          {[...p.historial].reverse().map((e) => (
            <li key={e.id} className="relative text-xs">
              <span className="absolute -left-[17px] top-1 size-2 rounded-full bg-stone-300 ring-2 ring-stone-50 dark:bg-stone-600 dark:ring-stone-900" />
              <div className="text-stone-500">{dateTimeFmt.format(new Date(e.fecha))}</div>
              <div>{describirEvento(e)}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function describirEvento(e: PedidoEvento): string {
  switch (e.tipo) {
    case "creado":
      return `Pedido creado${e.hasta ? ` como ${ESTADO_LABEL[e.hasta]}` : ""}`;
    case "editado":
      return "Datos editados";
    case "estado":
      return `${e.desde ? ESTADO_LABEL[e.desde] : "?"} → ${e.hasta ? ESTADO_LABEL[e.hasta] : "?"}${e.detalle ? ` · ${e.detalle}` : ""}`;
    case "aviso":
      return `✉️ ${e.detalle ?? "Aviso enviado"}`;
  }
}
