/**
 * The keep-alive exists so a free Supabase project never pauses and takes the
 * site down. It has to really query, record that it ran, refuse callers
 * without the cron secret when one is set, and let the status card tell the
 * owner when it has stopped.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.PINHIGH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pinhigh-keepalive-"));
delete process.env.DATABASE_URL;

const { keepAlive, cronAuthorized, keepAliveStatus, KEEPALIVE_SETTING, KEEPALIVE_STALE_MS } =
  await import("@/lib/keepalive");
const { getSetting } = await import("@/lib/db");

describe("keep-alive", () => {
  test("a run queries the database and stamps when it ran", async () => {
    const at = new Date("2026-09-26T05:17:00.000Z");
    await keepAlive(at);
    assert.equal(await getSetting(KEEPALIVE_SETTING), at.toISOString());
  });

  test("with a cron secret set, only Vercel's bearer header gets in", () => {
    assert.equal(cronAuthorized("Bearer s3cret", "s3cret"), true);
    assert.equal(cronAuthorized(null, "s3cret"), false);
    assert.equal(cronAuthorized("Bearer wrong", "s3cret"), false);
    assert.equal(cronAuthorized("s3cret", "s3cret"), false, "the scheme is required");
  });

  test("with no cron secret the endpoint stays open", () => {
    assert.equal(cronAuthorized(null, undefined), true);
    assert.equal(cronAuthorized(null, ""), true);
  });

  test("status: never run warns and says it clears within a day", () => {
    const item = keepAliveStatus("");
    assert.equal(item.level, "warn");
    assert.match(item.detail, /24 hours/);
    assert.match(item.action ?? "", /Cron Jobs/);
  });

  test("status: a recent run is ok and shows Dubai time", () => {
    const now = Date.parse("2026-09-26T12:00:00.000Z");
    const item = keepAliveStatus("2026-09-26T05:17:00.000Z", now);
    assert.equal(item.level, "ok");
    assert.match(item.detail, /09:17/, "05:17 UTC is 09:17 in Dubai");
  });

  test("status: a run older than the stale window warns and names the fix", () => {
    const last = "2026-09-20T05:17:00.000Z";
    const item = keepAliveStatus(last, Date.parse(last) + KEEPALIVE_STALE_MS + 1);
    assert.equal(item.level, "warn");
    assert.match(item.detail, /pauses/);
    assert.match(item.action ?? "", /Cron Jobs/);
  });
});
