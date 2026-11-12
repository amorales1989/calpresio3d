import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "./components/Dialog";
import { ExportPanel } from "./components/ExportPanel";
import { PedidoForm } from "./components/PedidoForm";
import { PedidosSection } from "./components/PedidosSection";
import { ProductsSection } from "./components/ProductsSection";
import { PieceSection } from "./components/PieceSection";
import { ProfileSection } from "./components/ProfileSection";
import { QuoteBuilder, type QuoteSource } from "./components/QuoteBuilder";
import { ResultsPanel } from "./components/ResultsPanel";
import { calculate, formatMoney, round2 } from "./lib/calc";
import { CURRENCY_SYMBOLS, type Currency } from "./lib/data";
import {
  defaultPiece,
  defaultProfile,
  mergeById,
  newId,
  normalizePiece,
  normalizeProduct,
  normalizeProfile,
  parseBackup,
  type BackupData,
  type Piece,
  type Product,
  type ProductInfo,
  type Profile,
} from "./lib/model";
import {
  ESTADO_LABEL,
  emptyInput,
  formatNumeroPedido,
  type Aviso,
  type DatosCalculo,
  type Estado,
  type OrigenPedido,
  type Pedido,
  type PedidoInput,
} from "./lib/pedidos";
import { LocalPedidosRepo, type PedidosRepo } from "./lib/pedidosRepo";
import { normalizeBusiness } from "./lib/quote";
import { KEYS, readJSON, readString, writeJSON, writeString } from "./lib/storage";

// ---------- carga inicial desde localStorage ----------

function loadProfiles(): Profile[] {
  const raw = readJSON<unknown>(KEYS.profiles, null);
  const list = Array.isArray(raw) ? raw.map(normalizeProfile).filter((p): p is Profile => p !== null) : [];
  return list.length ? list : [defaultProfile()];
}

function loadProducts(): Product[] {
  const raw = readJSON<unknown>(KEYS.products, null);
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter((p): p is Product => p !== null) : [];
}

function initialState() {
  const profiles = loadProfiles();
  const activeId = readString(KEYS.activeProfile);
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];
  return { profiles, draft: { ...active } };
}

/** Mail del negocio (se carga en "Datos de la empresa" del presupuesto): recibe el aviso de terminado. */
const tuEmail = () => normalizeBusiness(readJSON<unknown>(KEYS.business, null)).email.trim();

// Hoy los pedidos viven en el navegador; cuando esté el servidor se cambia por el repo del API.
const pedidosRepo: PedidosRepo = new LocalPedidosRepo(tuEmail);

type PedidoFormState =
  | { mode: "new"; initial: PedidoInput; origen: OrigenPedido; datosCalculo: DatosCalculo | null; origenLabel?: string }
  | { mode: "edit"; pedido: Pedido };

function avisoMsg(p: Pedido, aviso: Aviso): string {
  const n = formatNumeroPedido(p.numero);
  if (aviso.motivo) return `${n} terminado. ${aviso.motivo}`;
  const quien = aviso.destinatarios.map((d) => (d.rol === "vos" ? "vos" : "el cliente")).join(" y ");
  return `${n} terminado · aviso${aviso.simulado ? " simulado" : ""} por mail a ${quien}.`;
}

// ---------- pantallas: pedidos (inicio) y calculadora ----------

type View = "pedidos" | "calculadora";

const VIEWS: { key: View; label: string; hash: string }[] = [
  { key: "pedidos", label: "Pedidos", hash: "#/pedidos" },
  { key: "calculadora", label: "Calculadora", hash: "#/calculadora" },
];

// Se usa el hash para que funcionen "atrás" y los marcadores sin configurar el hosting
const viewFromHash = (): View => (window.location.hash === "#/calculadora" ? "calculadora" : "pedidos");

function useView() {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((v: View) => {
    window.location.hash = VIEWS.find((x) => x.key === v)!.hash;
  }, []);
  return [view, go] as const;
}

const sameProfile = (a: Profile, b: Profile) => JSON.stringify(a) === JSON.stringify(b);

// ---------- total fijo abajo (solo celular) ----------

/** Muestra el total mientras se cargan los datos de la pieza; se oculta cuando Resultados ya está a la vista. */
function MobileTotalBar({ total }: { total: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.getElementById("resultados");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Total a cobrar</div>
          <div className="truncate text-xl font-bold tabular-nums text-teal-800 dark:text-teal-300">{total}</div>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={() => document.getElementById("resultados")?.scrollIntoView({ behavior: "smooth" })}
        >
          Ver detalle
        </button>
      </div>
    </div>
  );
}

// ---------- toast mínimo ----------

function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setMsg({ text, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);
  return { msg, show };
}

export default function App() {
  const [{ profiles: initialProfiles, draft: initialDraft }] = useState(initialState);
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [draft, setDraft] = useState<Profile>(initialDraft);
  const [piece, setPiece] = useState<Piece>(() => normalizePiece(readJSON<unknown>(KEYS.piece, null)));
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const toast = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoForm, setPedidoForm] = useState<PedidoFormState | null>(null);
  const showToast = toast.show;
  const dialog = useDialog();
  const [view, goTo] = useView();

  const saved = profiles.find((p) => p.id === draft.id);
  const isSaved = saved !== undefined;
  const isDirty = !saved || !sameProfile(saved, draft);

  // ---------- persistencia ----------

  const storageWarned = useRef(false);
  const persist = useCallback(
    (ok: boolean) => {
      if (!ok && !storageWarned.current) {
        storageWarned.current = true;
        showToast("No se pudo guardar en este navegador (¿modo privado o almacenamiento lleno?).", "error");
      }
    },
    [showToast],
  );

  useEffect(() => persist(writeJSON(KEYS.profiles, profiles)), [profiles, persist]);
  useEffect(() => persist(writeJSON(KEYS.products, products)), [products, persist]);
  useEffect(() => {
    if (isSaved) writeString(KEYS.activeProfile, draft.id);
  }, [draft.id, isSaved]);

  // Pieza actual con debounce de 500 ms
  useEffect(() => {
    const t = window.setTimeout(() => persist(writeJSON(KEYS.piece, piece)), 500);
    return () => window.clearTimeout(t);
  }, [piece, persist]);

  // ---------- cálculo ----------

  const results = useMemo(() => calculate({ ...draft, ...piece }), [draft, piece]);
  const symbol = CURRENCY_SYMBOLS[draft.currency];

  // ---------- presupuesto ----------

  const [quote, setQuote] = useState<{ currency: Currency; keys: string[] } | null>(null);

  // Se relee al cambiar de pantalla o cerrar el presupuesto (donde se editan los datos de la empresa)
  const businessName = useMemo(
    () => normalizeBusiness(readJSON<unknown>(KEYS.business, null)).name.trim(),
    [view, quote],
  );
  const currentSource: QuoteSource | null =
    quote && quote.currency === draft.currency && results.total > 0
      ? {
          key: "current",
          label: `Pieza actual (calculadora) — ${formatMoney(results.total, symbol)}`,
          description: "Pieza impresa en 3D",
          detail: "",
          unitPrice: results.total,
        }
      : null;

  // ---------- perfiles ----------

  const confirmDiscard = async () =>
    !isDirty ||
    dialog.confirm(
      "¿Descartar los cambios del perfil?",
      `“${draft.name || "Sin nombre"}” tiene cambios sin guardar.`,
      "Descartar",
      true,
    );

  async function selectProfile(id: string) {
    if (id === draft.id) return;
    const p = profiles.find((x) => x.id === id);
    if (!p || !(await confirmDiscard())) return;
    setDraft({ ...p });
  }

  async function newProfile() {
    if (!(await confirmDiscard())) return;
    setDraft({ ...defaultProfile(), id: newId(), name: `Perfil ${profiles.length + 1}` });
  }

  function saveProfile() {
    const name = draft.name.trim() || "Perfil sin nombre";
    const p = { ...draft, name };
    setDraft(p);
    setProfiles((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
    toast.show(`Perfil “${name}” guardado.`);
  }

  async function deleteProfile() {
    if (!isSaved) {
      // borrador nunca guardado: descartarlo
      setDraft({ ...profiles[0] });
      return;
    }
    const ok = await dialog.confirm(
      `¿Eliminar el perfil “${saved.name}”?`,
      "Los productos guardados con este perfil conservan su copia.",
      "Eliminar",
      true,
    );
    if (!ok) return;
    const rest = profiles.filter((p) => p.id !== draft.id);
    const next = rest.length ? rest : [defaultProfile()];
    setProfiles(next);
    setDraft({ ...next[0] });
    toast.show("Perfil eliminado.");
  }

  // ---------- productos ----------

  function saveProduct(info: ProductInfo) {
    const product: Product = {
      id: newId(),
      ...info,
      createdAt: new Date().toISOString(),
      piece: { ...piece },
      profile: { ...draft },
      results: { ...results },
    };
    setProducts((list) => [product, ...list]);
    toast.show(`“${info.name}” guardado en Mis productos.`);
  }

  function updateProduct(id: string, info: ProductInfo) {
    setProducts((list) => list.map((x) => (x.id === id ? { ...x, ...info } : x)));
    toast.show("Producto actualizado.");
  }

  async function loadProduct(p: Product) {
    if (!(await confirmDiscard())) return;
    setPiece({ ...p.piece });
    // Si el perfil todavía existe, se carga la versión del producto como borrador
    // (si cambió desde entonces, queda marcado "con cambios" y se puede guardar o descartar).
    setDraft({ ...p.profile });
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.show(`Cargado “${p.name}”.`);
  }

  function duplicateProduct(p: Product) {
    const copy: Product = { ...p, id: newId(), name: `${p.name} (copia)`, createdAt: new Date().toISOString() };
    setProducts((list) => [copy, ...list]);
    toast.show("Producto duplicado.");
  }

  async function deleteProduct(p: Product) {
    if (!(await dialog.confirm(`¿Eliminar “${p.name}”?`, "No se puede deshacer.", "Eliminar", true))) return;
    setProducts((list) => list.filter((x) => x.id !== p.id));
  }

  // ---------- pedidos ----------

  useEffect(() => {
    pedidosRepo.list().then(setPedidos, () => showToast("No se pudieron cargar los pedidos.", "error"));
  }, [showToast]);

  const upsertPedido = (p: Pedido) =>
    setPedidos((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]));

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : "No se pudo guardar el pedido.", "error");

  function pedidoDesdeCalculadora() {
    setPedidoForm({
      mode: "new",
      initial: { ...emptyInput(draft.currency), precioUnitario: round2(results.total) },
      origen: { tipo: "calculadora" },
      datosCalculo: { piece: { ...piece }, profile: { ...draft }, results: { ...results } },
      origenLabel: `Pieza de la calculadora · ${formatMoney(results.total, symbol)} c/u`,
    });
  }

  function pedidoDesdeProducto(p: Product) {
    setPedidoForm({
      mode: "new",
      initial: { ...emptyInput(p.profile.currency), descripcion: p.material.trim() ? `${p.name} (${p.material.trim()})` : p.name, precioUnitario: round2(p.results.total) },
      origen: { tipo: "producto", productoId: p.id, nombre: p.name },
      datosCalculo: { piece: p.piece, profile: p.profile, results: p.results },
      origenLabel: `Producto “${p.name}”`,
    });
  }

  async function submitPedido(input: PedidoInput, estado: Estado) {
    if (!pedidoForm) return;
    try {
      if (pedidoForm.mode === "edit") {
        upsertPedido(await pedidosRepo.update(pedidoForm.pedido.id, input));
        toast.show(`Pedido ${formatNumeroPedido(pedidoForm.pedido.numero)} actualizado.`);
      } else {
        const p = await pedidosRepo.create({ input, estado, origen: pedidoForm.origen, datosCalculo: pedidoForm.datosCalculo });
        upsertPedido(p);
        toast.show(`Pedido ${formatNumeroPedido(p.numero)} creado.`);
        goTo("pedidos");
      }
      setPedidoForm(null);
    } catch (e) {
      fail(e);
    }
  }

  async function setEstadoPedido(p: Pedido, estado: Estado) {
    if (estado === p.estado) return;
    if (
      estado === "cancelado" &&
      !(await dialog.confirm(`¿Cancelar el pedido ${formatNumeroPedido(p.numero)}?`, `${p.clienteNombre} · ${p.descripcion}`, "Cancelar pedido", true))
    ) {
      return;
    }
    try {
      const { pedido, aviso } = await pedidosRepo.setEstado(p.id, estado);
      upsertPedido(pedido);
      if (aviso) toast.show(avisoMsg(pedido, aviso), aviso.motivo ? "error" : "ok");
      else toast.show(`${formatNumeroPedido(p.numero)} → ${ESTADO_LABEL[estado]}`);
    } catch (e) {
      fail(e);
    }
  }

  async function reenviarAviso(p: Pedido) {
    try {
      const { pedido, aviso } = await pedidosRepo.reenviarAviso(p.id);
      upsertPedido(pedido);
      toast.show(avisoMsg(pedido, aviso).replace("terminado", "terminado (reenvío)"), aviso.motivo ? "error" : "ok");
    } catch (e) {
      fail(e);
    }
  }

  async function deletePedido(p: Pedido) {
    const ok = await dialog.confirm(
      `¿Eliminar el pedido ${formatNumeroPedido(p.numero)}?`,
      `${p.clienteNombre} · ${p.descripcion}. No se puede deshacer (si solo no va más, mejor marcalo como Cancelado).`,
      "Eliminar",
      true,
    );
    if (!ok) return;
    try {
      await pedidosRepo.remove(p.id);
      setPedidos((list) => list.filter((x) => x.id !== p.id));
    } catch (e) {
      fail(e);
    }
  }

  // ---------- export / import ----------

  function exportAll() {
    const data: BackupData = {
      app: "calculadora-3d",
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles,
      products,
    };
    const json = JSON.stringify(data, null, 2);
    const filename = `calculadora-3d-${new Date().toISOString().slice(0, 10)}.json`;
    void dialog.ask({
      title: "Exportar datos",
      body: <ExportPanel json={json} filename={filename} counts={[profiles.length, products.length]} />,
      cancelValue: null,
      actions: [{ label: "Cerrar", value: null, variant: "secondary" }],
    });
  }

  async function importAll(file: File) {
    try {
      const { profiles: ip, products: iprod } = parseBackup(await file.text());
      const choice = await dialog.ask<"replace" | "merge" | null>({
        title: "Importar datos",
        body: (
          <>
            El archivo tiene {ip.length} perfil(es) y {iprod.length} producto(s). <strong>Combinar</strong> los suma a lo que
            ya tenés (si coinciden, se actualizan). <strong>Reemplazar</strong> borra lo actual.
          </>
        ),
        cancelValue: null,
        actions: [
          { label: "Cancelar", value: null, variant: "secondary" },
          { label: "Reemplazar todo", value: "replace", variant: "danger" },
          { label: "Combinar", value: "merge", variant: "primary" },
        ],
      });
      if (!choice) return;
      const replace = choice === "replace";
      const nextProfiles = replace ? ip : mergeById(profiles, ip);
      const finalProfiles = nextProfiles.length ? nextProfiles : [defaultProfile()];
      setProfiles(finalProfiles);
      setProducts(replace ? iprod : mergeById(products, iprod));
      const keep = finalProfiles.find((p) => p.id === draft.id);
      setDraft({ ...(keep ?? finalProfiles[0]) });
      toast.show(replace ? "Datos reemplazados." : "Datos combinados.");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "No se pudo importar el archivo.", "error");
    }
  }

  return (
    <div className={`page-gutter mx-auto max-w-6xl py-6 sm:py-10 ${view === "calculadora" ? "pb-28 lg:pb-10" : ""}`}>
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{businessName || "Impresiones 3D"}</h1>
        <nav
          aria-label="Secciones"
          className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-white p-1 sm:flex dark:border-stone-800 dark:bg-stone-900"
        >
          {VIEWS.map((v) => (
            <a
              key={v.key}
              href={v.hash}
              aria-current={view === v.key ? "page" : undefined}
              className={`rounded-lg px-4 py-2 text-center text-sm font-medium transition sm:py-1.5 ${
                view === v.key
                  ? "bg-teal-700 text-white dark:bg-teal-500 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              }`}
            >
              {v.label}
            </a>
          ))}
        </nav>
      </header>

      {view === "pedidos" ? (
        <main>
          <PedidosSection
            pedidos={pedidos}
            local={pedidosRepo.local}
            onNew={() =>
              setPedidoForm({ mode: "new", initial: emptyInput(draft.currency), origen: { tipo: "manual" }, datosCalculo: null })
            }
            onEdit={(pedido) => setPedidoForm({ mode: "edit", pedido })}
            onSetEstado={setEstadoPedido}
            onReenviarAviso={reenviarAviso}
            onDelete={deletePedido}
          />
        </main>
      ) : (
        <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-6">
            <ProfileSection
              profiles={profiles}
              draft={draft}
              isSaved={isSaved}
              isDirty={isDirty}
              onDraftChange={setDraft}
              onSelect={selectProfile}
              onNew={newProfile}
              onSave={saveProfile}
              onDelete={deleteProfile}
            />
            <PieceSection piece={piece} symbol={symbol} onChange={setPiece} onReset={() => setPiece(defaultPiece())} />
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <ResultsPanel
              results={results}
              symbol={symbol}
              multiplier={piece.profitMultiplier}
              profileName={draft.name || "Sin nombre"}
              onSaveProduct={saveProduct}
              onQuote={() => setQuote({ currency: draft.currency, keys: ["current"] })}
              onPedido={pedidoDesdeCalculadora}
            />
          </div>

          <ProductsSection
            products={products}
            onLoad={loadProduct}
            onDuplicate={duplicateProduct}
          onUpdate={updateProduct}
            onDelete={deleteProduct}
            onExport={exportAll}
            onImport={importAll}
            onPedido={pedidoDesdeProducto}
            onQuote={(p) => setQuote(p ? { currency: p.profile.currency, keys: [p.id] } : { currency: draft.currency, keys: [] })}
          />
        </main>
      )}

      <footer className="mt-10 text-center text-xs text-stone-400">
        Sin servidores: tus datos viven en este navegador. Exportá un JSON de vez en cuando como respaldo.
      </footer>

      {view === "calculadora" && <MobileTotalBar total={formatMoney(results.total, symbol)} />}

      {quote && (
        <QuoteBuilder
          currency={quote.currency}
          current={currentSource}
          products={products}
          initialKeys={quote.keys}
          onClose={() => setQuote(null)}
          onDone={toast.show}
        />
      )}

      {pedidoForm && (
        <PedidoForm
          key={pedidoForm.mode === "edit" ? pedidoForm.pedido.id : "new"}
          editing={pedidoForm.mode === "edit" ? { numero: pedidoForm.pedido.numero } : undefined}
          initial={pedidoForm.mode === "edit" ? pedidoForm.pedido : pedidoForm.initial}
          origenLabel={pedidoForm.mode === "new" ? pedidoForm.origenLabel : undefined}
          tuEmail={tuEmail()}
          onSubmit={submitPedido}
          onClose={() => setPedidoForm(null)}
        />
      )}

      {dialog.element}

      {toast.msg && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 lg:bottom-4 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.msg.kind === "error"
              ? "bg-red-700 text-white"
              : "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
          }`}
        >
          {toast.msg.text}
        </div>
      )}
    </div>
  );
}
