/**
 * The Data API lockdown: every public table has RLS on, anon cannot read or
 * write even if grants are restored, and the table owner still can.
 *
 * Runs the same SQL file the app applies on boot and that an operator pastes
 * into the Supabase SQL editor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA_SQL } from "../src/lib/db/schema";

const LOCKDOWN_SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0002_rls_lockdown.sql"),
  "utf8",
);

interface TablePosture {
  table_name: string;
  rls_enabled: boolean;
  policies: number;
  restrictive: number;
}

async function posture(db: PGlite): Promise<TablePosture[]> {
  const res = await db.query<TablePosture>(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
           (SELECT count(*)::int FROM pg_policy p
             WHERE p.polrelid = c.oid AND NOT p.polpermissive) AS restrictive
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY 1
  `);
  return res.rows;
}

describe("RLS lockdown", () => {
  test("closes every public table to anon and leaves the owner working", async () => {
    const db = new PGlite();
    await db.waitReady;
    await db.exec(SCHEMA_SQL);
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      GRANT anon TO CURRENT_USER;
      GRANT authenticated TO CURRENT_USER;
      CREATE TABLE public.surprise (id integer);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    `);
    await db.exec(
      `INSERT INTO products (
         id, article_number, brand, style_name, condition, colour, category, gender,
         is_visible, needs_review, cost_price, created_at, updated_at
       ) VALUES (
         'p1', 'AB1234', 'adidas', 'Polo', 'new', 'Navy', 'Polos', 'mens',
         1, 0, 12.5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
       )`,
    );
    await db.exec(
      `INSERT INTO admin_users (id, email, role, created_at)
       VALUES ('u1', 'owner@pinhighuae.com', 'owner', '2026-01-01T00:00:00.000Z')`,
    );

    await db.exec(LOCKDOWN_SQL);
    await db.exec(LOCKDOWN_SQL);

    const tables = await posture(db);
    const names = tables.map((t) => t.table_name);
    for (const expected of [
      "products",
      "variants",
      "product_images",
      "stock_imports",
      "quote_requests",
      "quote_lines",
      "quote_logos",
      "notification_recipients",
      "branding_placements",
      "admin_users",
      "settings",
      "column_mappings",
      "stock_alerts",
      "stock_adjustments",
      "audit_log",
      "surprise",
    ]) {
      assert.ok(names.includes(expected), `missing table ${expected}`);
    }
    for (const table of tables) {
      assert.equal(table.rls_enabled, true, `${table.table_name} RLS off`);
      assert.ok(table.policies >= 1, `${table.table_name} has no policy`);
      assert.ok(table.restrictive >= 1, `${table.table_name} deny policy is not restrictive`);
    }

    const owner = await db.query<{ n: number; cost: number }>(
      "SELECT count(*)::int AS n, max(cost_price) AS cost FROM products",
    );
    assert.equal(owner.rows[0].n, 1);
    assert.equal(owner.rows[0].cost, 12.5);

    // Grants restored: RLS, not the missing GRANT, is what stops anon.
    await db.exec("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon");

    await db.exec("SET ROLE anon");
    const seen = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM products");
    assert.equal(seen.rows[0].n, 0, "anon can read products");
    const secrets = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM admin_users");
    assert.equal(secrets.rows[0].n, 0, "anon can read admin_users");
    await assert.rejects(
      db.exec(
        `INSERT INTO quote_requests (
           id, reference, company_name, contact_name, email, phone, delivery_emirate,
           created_at, updated_at
         ) VALUES (
           'q1', 'Q-1', 'Acme', 'Ada', 'ada@acme.test', '0500000000', 'Dubai',
           '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
         )`,
      ),
      /row-level security/i,
    );
    await db.exec("RESET ROLE");

    await db.exec(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('announcement', 'hello', '2026-01-01T00:00:00.000Z')`,
    );
    const setting = await db.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'announcement'",
    );
    assert.equal(setting.rows[0].value, "hello");

    await db.close();
  });
});
