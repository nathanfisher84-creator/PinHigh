import "server-only";
import * as core from "./core";
import { ensureSeeded } from "./seed";

/**
 * The database entry point everything above the storage layer imports.
 *
 * Its one job beyond re-exporting `core` is to guarantee the store is seeded
 * before the first read. Module layering, deliberately acyclic:
 *
 *   repositories, actions  ->  db/index  ->  db/seed  ->  import/*  ->  db/core
 *
 * The importer and the seeder talk to `db/core` directly. Only code above them
 * imports this file, so there is no cycle to reason about at module-eval time.
 */

let readyPromise: Promise<void> | undefined;

function ensureReady(): Promise<void> {
  // Memoised: ensureSeeded runs queries of its own through db/core directly,
  // so nothing here re-enters this guard.
  readyPromise ??= core.ready().then(() => ensureSeeded());
  return readyPromise;
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  await ensureReady();
  return core.all<T>(sql, ...params);
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  await ensureReady();
  return core.get<T>(sql, ...params);
}

export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  await ensureReady();
  return core.run(sql, ...params);
}

export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await ensureReady();
  return core.transaction(fn);
}

export async function getSetting(key: string): Promise<string> {
  await ensureReady();
  return core.getSetting(key);
}

export async function getSettings(): Promise<Record<string, string>> {
  await ensureReady();
  return core.getSettings();
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureReady();
  return core.setSetting(key, value);
}

export async function audit(
  action: string,
  subject?: string,
  detail?: unknown,
  actor?: string,
): Promise<void> {
  await ensureReady();
  return core.audit(action, subject, detail, actor);
}

export { uid, now, SETTING_DEFAULTS } from "./core";
