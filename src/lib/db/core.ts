import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

/**
 * The single seam between the application and its store.
 *
 * Everything above this file talks in domain types and never sees a driver.
 * The store is Postgres either way:
 *
 *   - `DATABASE_URL` set (Supabase's transaction pooler in production): the
 *     `pg` driver against the real database. This is what makes admin work
 *     persist on Vercel, where the filesystem is wiped on every cold start.
 *   - no `DATABASE_URL`: an embedded PGlite database persisted under `.data/`
 *     (or `/tmp` on Vercel), so the whole application still runs end to end
 *     with no credentials — same dialect, same SQL, zero setup.
 *
 * Queries are written with `?` placeholders and converted to `$1…$n` here,
 * which kept the entire repository layer unchanged through the SQLite →
 * Postgres migration.
 */

const DATA_DIR =
  process.env.PINHIGH_DATA_DIR ??
  (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data"));

/** One row shape for both drivers. */
interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface Driver {
  query(text: string, params: unknown[]): Promise<QueryResult>;
  /** Multi-statement DDL. */
  exec(text: string): Promise<void>;
  /** Run fn with every query pinned to one connection, inside BEGIN/COMMIT. */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

declare global {
  // eslint-disable-next-line no-var
  var __pinhighDriver: Promise<Driver> | undefined;
  // eslint-disable-next-line no-var
  var __pinhighReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __pinhighSeeded: boolean | undefined;
}

/* -------------------------------------------------------------------------
   pg driver (Supabase / any Postgres)
   ---------------------------------------------------------------------- */

async function openPg(url: string): Promise<Driver> {
  const { Pool, types } = await import("pg");

  // int8 (COUNT, SUM of integers) and numeric otherwise arrive as strings —
  // every repository compares and adds them as numbers.
  types.setTypeParser(20, (v: string) => Number(v));
  types.setTypeParser(1700, (v: string) => Number(v));

  const pool = new Pool({
    connectionString: url,
    // Serverless: many short-lived instances, each holding few connections.
    // Supabase's transaction pooler multiplexes the rest.
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  const als = new AsyncLocalStorage<import("pg").PoolClient>();

  return {
    async query(text, params) {
      const client = als.getStore();
      const res = client
        ? await client.query(text, params)
        : await pool.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    },
    async exec(text) {
      const client = als.getStore();
      if (client) await client.query(text);
      else await pool.query(text);
    },
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await als.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* the original error is the one worth surfacing */
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/* -------------------------------------------------------------------------
   PGlite driver (embedded fallback — no credentials required)
   ---------------------------------------------------------------------- */

async function openPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  // In-memory, always: PGlite is a single-process database, and file storage
  // deadlocks the moment `next build` fans out across workers that all open
  // the same directory. Every process seeds its own copy instead (the seed is
  // idempotent and fast); real persistence is DATABASE_URL's job.
  const db = new PGlite({
    // Match the pg driver: int8 and numeric arrive as numbers, not strings
    // or BigInts, because every repository does arithmetic on them.
    parsers: {
      20: (v: string) => Number(v),
      1700: (v: string) => Number(v),
    },
  });
  await db.waitReady;

  // PGlite is a single session, so statements outside a transaction are
  // serialised one at a time. Statements *inside* a transaction must bypass
  // the queue — the transaction wrapper holds the queue's head, and a query
  // that re-entered it would wait on the very transaction waiting on it.
  const inTransaction = new AsyncLocalStorage<boolean>();
  let chain = Promise.resolve() as Promise<unknown>;
  const serialise = <T>(fn: () => Promise<T>): Promise<T> => {
    if (inTransaction.getStore()) return fn();
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  return {
    query: (text, params) =>
      serialise(async () => {
        const res = await db.query<Record<string, unknown>>(text, params as never[]);
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      }),
    exec: (text) =>
      serialise(async () => {
        await db.exec(text);
      }),
    withTransaction: (fn) =>
      serialise(() =>
        inTransaction.run(true, async () => {
          await db.exec("BEGIN");
          try {
            const result = await fn();
            await db.exec("COMMIT");
            return result;
          } catch (err) {
            try {
              await db.exec("ROLLBACK");
            } catch {
              /* surface the original error */
            }
            throw err;
          }
        }),
      ),
  };
}

/* -------------------------------------------------------------------------
   Boot
   ---------------------------------------------------------------------- */

async function migrate(driver: Driver): Promise<void> {
  const ddl = async () => {
    await driver.exec(SCHEMA_SQL);
    // Columns added after the first release. Postgres has IF NOT EXISTS for
    // this, so no error-swallowing is needed.
    await driver.exec(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price REAL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_review INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE stock_imports ADD COLUMN IF NOT EXISTS invoice_refs TEXT;
      ALTER TABLE stock_imports ADD COLUMN IF NOT EXISTS order_refs TEXT;
    `);
  };

  if (process.env.DATABASE_URL) {
    // Several processes can boot at once (next build prerenders in parallel
    // workers), so exactly one runs the DDL while the rest wait. The lock is
    // TRANSACTION-scoped, not session-scoped: through a transaction pooler a
    // session lock lands on an arbitrary pooled backend and the unlock can run
    // on a different one, leaking the lock forever — which is precisely how
    // the first deploy died ("canceling statement due to statement timeout"
    // on pg_advisory_lock). A xact lock releases with the COMMIT no matter
    // which backend served it. Postgres DDL is transactional, so the whole
    // migration commits or none of it does.
    await driver.withTransaction(async () => {
      await driver.query("SELECT pg_advisory_xact_lock(727272)", []);
      await ddl();
    });
  } else {
    await ddl();
  }
}

function getDriver(): Promise<Driver> {
  if (!globalThis.__pinhighDriver) {
    const url = process.env.DATABASE_URL;
    globalThis.__pinhighDriver = url ? openPg(url) : openPglite();
  }
  return globalThis.__pinhighDriver;
}

/** Resolves once the schema exists. Memoised for the life of the process. */
export function ready(): Promise<void> {
  if (!globalThis.__pinhighReady) {
    globalThis.__pinhighReady = getDriver()
      .then(migrate)
      .catch((err) => {
        // Let the next request retry rather than caching a dead database.
        globalThis.__pinhighReady = undefined;
        throw err;
      });
  }
  return globalThis.__pinhighReady;
}

/* -------------------------------------------------------------------------
   Query helpers
   ---------------------------------------------------------------------- */

/**
 * Convert `?` placeholders to Postgres `$1…$n`, skipping string literals and
 * comments. The repositories were written against `?` and there is no reason
 * to churn every query for punctuation.
 */
function numberPlaceholders(sql: string): string {
  let out = "";
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
    } else if (ch === "?") {
      out += `$${++n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Booleans are stored as 0/1 and undefined is not a bindable value. */
function bind(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number" || typeof p === "bigint" || typeof p === "string") return p;
    if (p instanceof Uint8Array) return p;
    return JSON.stringify(p);
  });
}

async function query(sql: string, params: unknown[]): Promise<QueryResult> {
  await ready();
  const driver = await getDriver();
  return driver.query(numberPlaceholders(sql), bind(params));
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await query(sql, params);
  return res.rows as T[];
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const res = await query(sql, params);
  return (res.rows[0] as T | undefined) ?? undefined;
}

export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  const res = await query(sql, params);
  return { changes: res.rowCount };
}

/**
 * Run a unit of work in a transaction. The stock import commits inside one of
 * these (§4.2 step 5) — a partial stock write is the worst possible outcome,
 * because it looks like it worked.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await ready();
  const driver = await getDriver();
  return driver.withTransaction(fn);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------
   Settings
   ---------------------------------------------------------------------- */

export const SETTING_DEFAULTS: Record<string, string> = {
  last_import_at: "",
  branding_min_units: "12",
  announcement: "",
  contact_email: "sales@pinhighuae.com",
  contact_phone: "+971 4 000 0000",
  contact_whatsapp: "+971500000000",
  show_non_new_stock: "false",
  quote_response_hours: "24",
};

export async function getSetting(key: string): Promise<string> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    now(),
  );
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/* -------------------------------------------------------------------------
   Audit log (§11)
   ---------------------------------------------------------------------- */

export async function audit(
  action: string,
  subject?: string,
  detail?: unknown,
  actor?: string,
): Promise<void> {
  await run(
    `INSERT INTO audit_log (id, actor, action, subject, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    uid(),
    actor ?? "owner",
    action,
    subject ?? null,
    detail === undefined ? null : JSON.stringify(detail),
    now(),
  );
}
