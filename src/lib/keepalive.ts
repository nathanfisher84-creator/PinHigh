import "server-only";
import { get, setSetting } from "@/lib/db";
import type { StatusItem } from "@/lib/status";

/**
 * Daily database keep-alive.
 *
 * Supabase pauses a Free-plan project that sees too few queries in a week,
 * and a paused project takes every database-backed page down until someone
 * restores it by hand. Their guidance is that a few ordinary queries a day
 * is enough to prevent it, so a Vercel Cron job (vercel.json) calls
 * /api/keepalive once a day and this runs a handful of real reads.
 *
 * The run is stamped in settings so the dashboard status card can say when
 * it last worked — a silent cron that stopped firing is exactly the failure
 * the owner would otherwise only find out about when the site goes down.
 */

export const KEEPALIVE_SETTING = "keepalive_at";

/** How stale the last run may be before the status card warns. */
export const KEEPALIVE_STALE_MS = 3 * 24 * 60 * 60 * 1000;

export async function keepAlive(at: Date = new Date()): Promise<void> {
  await get("SELECT COUNT(*) AS n FROM products");
  await get("SELECT COUNT(*) AS n FROM quote_requests");
  await setSetting(KEEPALIVE_SETTING, at.toISOString());
}

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron calls when the
 * project has CRON_SECRET set. With no secret configured the endpoint stays
 * open: it only runs two counts and returns nothing, so the worst a stranger
 * can do is keep the database awake.
 */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return header === `Bearer ${secret}`;
}

export function keepAliveStatus(lastRun: string, nowMs: number = Date.now()): StatusItem {
  const at = Date.parse(lastRun);
  if (!lastRun || Number.isNaN(at)) {
    return {
      key: "keepalive",
      label: "Daily database check",
      level: "warn",
      detail: "Hasn't run yet. It runs once a day, so this clears within 24 hours of a new deployment.",
      action:
        "If it stays like this for more than a day, the scheduled job isn't running and the free database may pause after a quiet week. Needs your developer: check Vercel → Settings → Cron Jobs.",
    };
  }
  const when = new Date(at).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (nowMs - at > KEEPALIVE_STALE_MS) {
    return {
      key: "keepalive",
      label: "Daily database check",
      level: "warn",
      detail: `Last ran ${when} (Dubai time). The free database pauses after about a week without activity, which takes the site down.`,
      action: "Needs your developer: check Vercel → Settings → Cron Jobs is enabled and the last run succeeded.",
    };
  }
  return {
    key: "keepalive",
    label: "Daily database check",
    level: "ok",
    detail: `Last ran ${when} (Dubai time). This keeps the free database from pausing.`,
  };
}
