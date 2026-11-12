// Conexión a PostgreSQL y migraciones (se aplican solas al arrancar, en orden y una sola vez).
import pg from "pg";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createDb(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

// Cada documento (perfil, producto, pedido) se guarda como JSONB con el mismo formato que usa el front;
// las columnas aparte son las que se usan para buscar u ordenar.
const MIGRATIONS: string[] = [
  `create table sessions (
     token_hash text primary key,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null
   );
   create table profiles (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   create table products (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   create table settings (
     key text primary key,
     value jsonb not null,
     updated_at timestamptz not null default now()
   );
   create table pedidos (
     id text primary key,
     numero integer not null unique,
     estado text not null,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );`,
];

export async function migrate(db: Db): Promise<void> {
  const c = await db.connect();
  try {
    await c.query("begin");
    // Evita que dos instancias migren a la vez
    await c.query("select pg_advisory_xact_lock(727001)");
    await c.query("create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())");
    const { rows } = await c.query<{ v: number | null }>("select max(version) as v from schema_migrations");
    const current = rows[0].v ?? 0;
    for (let i = current; i < MIGRATIONS.length; i++) {
      await c.query(MIGRATIONS[i]);
      await c.query("insert into schema_migrations (version) values ($1)", [i + 1]);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Corre `fn` dentro de una transacción. */
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
