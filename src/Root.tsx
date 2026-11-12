import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import App from "./App";
import {
  USA_SERVIDOR,
  api,
  createLocalBackend,
  createRemoteBackend,
  loadLocalData,
  loadRemoteData,
  setUnauthorizedHandler,
  type Backend,
  type InitialData,
} from "./lib/backend";
import { readString, writeString } from "./lib/storage";

const MIGRATED_KEY = "calc3d:subidoAlServidor";

type State =
  | { kind: "cargando" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "subir"; counts: { products: number; pedidos: number; profiles: number } }
  | { kind: "listo"; backend: Backend; initial: InitialData; user?: string };

/** ¿Hay algo en este navegador que valga la pena subir al servidor (que está vacío)? */
function pendingUpload(server: { profiles: unknown[]; products: unknown[]; pedidos: unknown[] }) {
  if (readString(MIGRATED_KEY)) return null;
  if (server.profiles.length || server.products.length || server.pedidos.length) return null;
  const local = loadLocalData();
  const counts = { products: local.products.length, pedidos: local.pedidos.length, profiles: local.profiles.length };
  return counts.products || counts.pedidos || counts.profiles ? counts : null;
}

export function Root() {
  const [state, setState] = useState<State>(() =>
    USA_SERVIDOR ? { kind: "cargando" } : { kind: "listo", backend: createLocalBackend(), initial: loadLocalData() },
  );

  const load = useCallback(async () => {
    setState({ kind: "cargando" });
    try {
      const session = await api<{ user: string }>("GET", "/session");
      const data = await loadRemoteData();
      const counts = pendingUpload(data);
      if (counts) return setState({ kind: "subir", counts });
      setState({ kind: "listo", backend: createRemoteBackend(data.mail), initial: data, user: session.user });
    } catch (e) {
      // El 401 lo maneja setUnauthorizedHandler (pasa al login)
      if (!(e instanceof Error && "status" in e && e.status === 401)) {
        setState({ kind: "error", message: e instanceof Error ? e.message : "No se pudo conectar con el servidor." });
      }
    }
  }, []);

  useEffect(() => {
    if (!USA_SERVIDOR) return;
    setUnauthorizedHandler(() => setState({ kind: "login" }));
    void load();
  }, [load]);

  async function logout() {
    await api("POST", "/logout").catch(() => {});
    setState({ kind: "login" });
  }

  async function upload(yes: boolean) {
    if (yes) {
      setState({ kind: "cargando" });
      try {
        const local = loadLocalData();
        await api("POST", "/import", local);
      } catch (e) {
        return setState({ kind: "error", message: e instanceof Error ? e.message : "No se pudieron subir los datos." });
      }
    }
    writeString(MIGRATED_KEY, new Date().toISOString());
    void load();
  }

  switch (state.kind) {
    case "listo":
      return (
        <App
          backend={state.backend}
          initial={state.initial}
          user={state.user}
          onLogout={state.backend.remote ? logout : undefined}
        />
      );
    case "login":
      return <LoginScreen onLoggedIn={load} />;
    case "subir":
      return (
        <Card title="Datos en este navegador">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Encontramos datos guardados en este navegador: {state.counts.products} producto(s), {state.counts.pedidos} pedido(s) y{" "}
            {state.counts.profiles} perfil(es). Tu cuenta en el servidor todavía está vacía.
          </p>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">¿Los subimos para verlos desde cualquier dispositivo?</p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" className="btn-primary py-2.5" onClick={() => upload(true)}>
              Subir mis datos
            </button>
            <button type="button" className="btn-secondary py-2.5" onClick={() => upload(false)}>
              Empezar de cero
            </button>
          </div>
        </Card>
      );
    case "error":
      return (
        <Card title="No se pudo cargar">
          <p className="text-sm text-stone-600 dark:text-stone-400">{state.message}</p>
          <button type="button" className="btn-primary mt-5 w-full py-2.5" onClick={load}>
            Reintentar
          </button>
        </Card>
      );
    default:
      return (
        <div className="flex min-h-dvh items-center justify-center text-sm text-stone-500" role="status">
          Cargando…
        </div>
      );
  }
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page-gutter flex min-h-dvh items-center justify-center py-10">
      <div className="card w-full max-w-sm">
        <h1 className="mb-3 text-xl font-bold tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/login", { user, password });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setBusy(false);
    }
  }

  return (
    <Card title="Iniciar sesión">
      {/* autocomplete para que el celular ofrezca guardar y completar la contraseña */}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-user" className="text-xs font-medium text-stone-600 dark:text-stone-400">
            Usuario
          </label>
          <input
            id="login-user"
            className="field-input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-pass" className="text-xs font-medium text-stone-600 dark:text-stone-400">
            Contraseña
          </label>
          <input
            id="login-pass"
            type="password"
            className="field-input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary py-2.5" disabled={busy || !user || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </Card>
  );
}
