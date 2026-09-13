/**
 * The status card must tell the owner the truth about the deployment, and
 * say whose job each gap is. Environment is manipulated per test; the module
 * reads it at call time.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.PINHIGH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pinhigh-status-"));
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.VERCEL_URL;
delete process.env.ADMIN_SESSION_SECRET;
delete process.env.GMAIL_USER;
delete process.env.RESEND_API_KEY;

const { systemStatus, worstLevel } = await import("@/lib/status");

function item(items: Awaited<ReturnType<typeof systemStatus>>, key: string) {
  const found = items.find((i) => i.key === key);
  assert.ok(found, `status item ${key}`);
  return found;
}

describe("system status", () => {
  test("a bare deployment on Vercel is red where it matters, and names the fix", async () => {
    process.env.VERCEL = "1";
    const items = await systemStatus();
    assert.equal(item(items, "database").level, "off");
    assert.match(item(items, "database").action ?? "", /DATABASE_URL/);
    assert.equal(item(items, "storage").level, "off");
    assert.equal(item(items, "secret").level, "off");
    assert.match(item(items, "secret").action ?? "", /ADMIN_SESSION_SECRET/);
    assert.equal(item(items, "email").level, "off");
    assert.equal(item(items, "email").href, "/admin/settings", "the owner's own fix");
    assert.equal(worstLevel(items), "off");
    delete process.env.VERCEL;
  });

  test("locally the same gaps are only warnings", async () => {
    const items = await systemStatus();
    assert.equal(item(items, "database").level, "warn");
    assert.equal(item(items, "storage").level, "warn");
  });

  test("environment fixes turn lines green without exposing values", async () => {
    process.env.DATABASE_URL = "postgres://user:hunter2@db.example/pinhigh";
    process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    const items = await systemStatus();
    // The database line is judged from the env var, not a live connection —
    // a bad URL would fail the request long before this card renders.
    assert.equal(item(items, "database").level, "ok");
    assert.equal(item(items, "secret").level, "ok");
    assert.equal(item(items, "ratelimit").level, "ok");
    const text = JSON.stringify(items);
    assert.doesNotMatch(text, /hunter2/);
    assert.doesNotMatch(text, /tok"/);
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  test("nobody to notify is a red line pointing at Recipients", async () => {
    const db = await import("@/lib/db");
    // The seed installs a default recipient, so the healthy case comes first.
    assert.equal(item(await systemStatus(), "recipients").level, "ok");

    await db.run("UPDATE notification_recipients SET is_active = 0");
    const r = item(await systemStatus(), "recipients");
    assert.equal(r.level, "off");
    assert.equal(r.href, "/admin/recipients");
    await db.run("UPDATE notification_recipients SET is_active = 1");
  });
});
