import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

/**
 * The single seam between the application and its store.
 *
 * Everything above this file talks in domain types and never sees SQL. Spec §2
 * specifies Supabase Postgres; swapping to it means reimplementing the query
 * helpers below against `@supabase/supabase-js` and pointing the repositories
 * at them — nothing in the components, actions or importer changes.
 *
 * SQLite is used here because it runs with no credentials, which keeps the
 * catalogue, importer and quote flow demonstrable end to end today.
 */

/**
 * Where the database file lives.
 *
 * On Vercel the deployment bundle is read-only and `/tmp` is the only writable
 * path, so the store goes there and is re-seeded per instance. See
 * `lib/runtime.ts` for what that costs and how the site declares it.
 */
const DATA_DIR =
  process.env.PINHIGH_DATA_DIR ??
  (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data"));

const DB_PATH = path.join(DATA_DIR, "pinhigh.db");

declare global {
  // eslint-disable-next-line no-var
  var __pinhighDb: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __pinhighSeeded: boolean | undefined;
}

function open(): DatabaseSync {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  /*
   * Set the busy timeout before anything else touches the file.
   *
   * More than one process opens this database at once — `next build` fans out
   * across worker processes to prerender pages, and a server runs alongside
   * the dev server in normal use. Without a timeout, any write that meets a
   * held lock fails immediately with SQLITE_BUSY rather than waiting, which
   * showed up as "database is locked" killing the build during sitemap
   * generation. Five seconds is far longer than any write here takes.
   */
  db.exec("PRAGMA busy_timeout = 5000");

  db.exec(SCHEMA_SQL);

  /*
   * Columns added after the first release. CREATE TABLE IF NOT EXISTS will not
   * add them to a database that already exists, so they are applied here and
   * the duplicate-column error is the expected no-op on an up-to-date file.
   */
  for (const alter of [
    "ALTER TABLE products ADD COLUMN cost_price REAL",
    "ALTER TABLE products ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE stock_imports ADD COLUMN invoice_refs TEXT",
  ]) {
    try {
      db.exec(alter);
    } catch {
      /* already present */
    }
  }

  return db;
}

/** Cached on globalThis so dev-server hot reloads do not open a handle per edit. */
export function getDb(): DatabaseSync {
  if (!globalThis.__pinhighDb) {
    globalThis.__pinhighDb = open();
  }
  return globalThis.__pinhighDb;
}

/* -------------------------------------------------------------------------
   Query helpers
   ---------------------------------------------------------------------- */

type Param = string | number | bigint | null | Uint8Array;

/** Booleans are stored as 0/1 and undefined is not a bindable value. */
function bind(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number" || typeof p === "bigint" || typeof p === "string") return p;
    if (p instanceof Uint8Array) return p;
    return JSON.stringify(p);
  });
}

/**
 * node:sqlite hands back null-prototype objects. React Server Components refuse
 * to serialise those across the server/client boundary ("Only plain objects …
 * can be passed to Client Components"), and the failure surfaces far from here
 * as an opaque render error. Reshaping every row once, at the point they enter
 * the application, is much cheaper than debugging it at each boundary.
 */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return (getDb().prepare(sql).all(...bind(params)) as unknown[]).map((r) => plain<T>(r));
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  const row = getDb().prepare(sql).get(...bind(params));
  return row === undefined || row === null ? undefined : plain<T>(row);
}

export function run(sql: string, ...params: unknown[]) {
  return getDb().prepare(sql).run(...bind(params));
}

/**
 * Run a unit of work in a transaction. The stock import commits inside one of
 * these (§4.2 step 5) — a partial stock write is the worst possible outcome,
 * because it looks like it worked.
 */
export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* the original error is the one worth surfacing */
    }
    throw err;
  }
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

export function getSetting(key: string): string {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    now(),
  );
}

export function getSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/* -------------------------------------------------------------------------
   Audit log (§11)
   ---------------------------------------------------------------------- */

export function audit(action: string, subject?: string, detail?: unknown, actor?: string) {
  run(
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
