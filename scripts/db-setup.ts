/**
 * Prepare the remote database before `next build` starts.
 *
 * Run as its own build step (see package.json) via the same resolver hook the
 * tests use: `node --import ./tests/alias-hook.mjs scripts/db-setup.ts`.
 *
 * Why this exists: the first deploy against a fresh Supabase project has to
 * write the whole catalogue across the ocean — hundreds of statements from a
 * US build machine to a Middle-East database. Done lazily inside page
 * prerendering, that blows Next's 60-second per-page budget and the build
 * dies. Here it runs once, in one process, with no clock on it. By the time
 * `next build` prerenders, the data exists and every page is a handful of
 * fast reads.
 *
 * Without DATABASE_URL this is a no-op: the embedded in-memory store seeds
 * itself per process, which is fast enough to live inside the build.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// npm scripts do not load Next's env files, but `next build` will — so this
// step must see the same DATABASE_URL the build workers are about to use.
for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  console.log("[db-setup] no DATABASE_URL — embedded store seeds itself, nothing to do");
  process.exit(0);
}

const started = Date.now();
console.log("[db-setup] preparing the remote database…");

const { ready, get } = await import("@/lib/db/core");
const { ensureSeeded } = await import("@/lib/db/seed");

await ready();
await ensureSeeded();

const products = await get<{ n: number }>("SELECT COUNT(*) AS n FROM products");
const units = await get<{ n: number }>("SELECT COALESCE(SUM(quantity), 0) AS n FROM variants");
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(
  `[db-setup] done in ${seconds}s — ${products?.n ?? 0} articles, ${units?.n ?? 0} units on hand`,
);
if ((products?.n ?? 0) === 0) {
  console.warn(
    "[db-setup] WARNING: the catalogue is empty. The build will proceed — upload stock through the admin panel.",
  );
}

// The pg pool keeps the event loop alive; the work is committed, so leave.
process.exit(0);
