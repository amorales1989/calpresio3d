import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "./components/Dialog";
import { ExportPanel } from "./components/ExportPanel";
import { ProductsSection } from "./components/ProductsSection";
import { PieceSection } from "./components/PieceSection";
import { ProfileSection } from "./components/ProfileSection";
import { QuoteBuilder, type QuoteSource } from "./components/QuoteBuilder";
import { ResultsPanel } from "./components/ResultsPanel";
import { calculate, formatMoney } from "./lib/calc";
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
  type Profile,
} from "./lib/model";
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

const sameProfile = (a: Profile, b: Profile) => JSON.stringify(a) === JSON.stringify(b);

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
  const showToast = toast.show;
  const dialog = useDialog();

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
  const currentSource: QuoteSource | null =
    quote && quote.currency === draft.currency && results.total > 0
      ? {
          key: "current",
          label: `Pieza actual (calculadora) — ${formatMoney(results.total, symbol)}`,
          description: "Pieza impresa en 3D",
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

  function saveProduct(name: string) {
    const product: Product = {
      id: newId(),
      name,
      createdAt: new Date().toISOString(),
      piece: { ...piece },
      profile: { ...draft },
      results: { ...results },
    };
    setProducts((list) => [product, ...list]);
    toast.show(`“${name}” guardado en Mis productos.`);
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
    <div className="page-gutter mx-auto max-w-6xl py-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calculadora de impresiones 3D</h1>
        <p className="mt-1 text-sm text-stone-500">Costo real y precio de venta de cada pieza. Todo queda guardado en tu navegador.</p>
      </header>

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
          />
        </div>

        <ProductsSection
          products={products}
          onLoad={loadProduct}
          onDuplicate={duplicateProduct}
          onDelete={deleteProduct}
          onExport={exportAll}
          onImport={importAll}
          onQuote={(p) => setQuote(p ? { currency: p.profile.currency, keys: [p.id] } : { currency: draft.currency, keys: [] })}
        />
      </main>

      <footer className="mt-10 text-center text-xs text-stone-400">
        Sin servidores: tus datos viven en este navegador. Exportá un JSON de vez en cuando como respaldo.
      </footer>

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

      {dialog.element}

      {toast.msg && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
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
