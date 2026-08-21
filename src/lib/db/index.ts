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

let ready = false;

function ensureReady(): void {
  if (ready) return;
  // Set first: ensureSeeded runs queries of its own, and those must not
  // re-enter this guard.
  ready = true;
  core.getDb();
  ensureSeeded();
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  ensureReady();
  return core.all<T>(sql, ...params);
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  ensureReady();
  return core.get<T>(sql, ...params);
}

export function run(sql: string, ...params: unknown[]) {
  ensureReady();
  return core.run(sql, ...params);
}

export function transaction<T>(fn: () => T): T {
  ensureReady();
  return core.transaction(fn);
}

export function getDb() {
  ensureReady();
  return core.getDb();
}

export function getSetting(key: string): string {
  ensureReady();
  return core.getSetting(key);
}

export function getSettings(): Record<string, string> {
  ensureReady();
  return core.getSettings();
}

export function setSetting(key: string, value: string): void {
  ensureReady();
  core.setSetting(key, value);
}

export function audit(action: string, subject?: string, detail?: unknown, actor?: string) {
  ensureReady();
  core.audit(action, subject, detail, actor);
}

export { uid, now, SETTING_DEFAULTS } from "./core";
