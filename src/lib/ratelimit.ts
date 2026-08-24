import "server-only";

/**
 * Rate limiting (spec §2, §7.2): 5 quote submissions per IP per hour.
 *
 * Spec names Upstash Redis, and that is what this uses when the environment is
 * configured — on Vercel the process is short-lived and shared state has to
 * live somewhere else. The in-memory fallback exists so local development and
 * a single-instance deployment are still protected rather than wide open, and
 * it says so plainly rather than pretending to be distributed.
 */

interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

const WINDOW_SECONDS = 3600;

/* -------------------------------------------------------------------------
   In-memory fallback
   ---------------------------------------------------------------------- */

const memory = new Map<string, { count: number; expires: number }>();

function memoryLimit(key: string, max: number): LimitResult {
  const nowMs = Date.now();
  const entry = memory.get(key);

  if (!entry || entry.expires < nowMs) {
    memory.set(key, { count: 1, expires: nowMs + WINDOW_SECONDS * 1000 });
    return { allowed: true, remaining: max - 1, resetSeconds: WINDOW_SECONDS };
  }

  entry.count++;
  const resetSeconds = Math.ceil((entry.expires - nowMs) / 1000);

  // Opportunistic sweep so a long-running process does not accumulate keys.
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.expires < nowMs) memory.delete(k);
  }

  return {
    allowed: entry.count <= max,
    remaining: Math.max(0, max - entry.count),
    resetSeconds,
  };
}

/* -------------------------------------------------------------------------
   Upstash
   ---------------------------------------------------------------------- */

async function upstashLimit(key: string, max: number): Promise<LimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    // INCR then EXPIRE on first write — a fixed window, which is what the spec
    // describes and is adequate for abuse prevention on a quote form.
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(WINDOW_SECONDS), "NX"],
        ["TTL", key],
      ]),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const results = (await response.json()) as { result: number }[];
    const count = Number(results[0]?.result ?? 0);
    const ttl = Number(results[2]?.result ?? WINDOW_SECONDS);

    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      resetSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
    };
  } catch {
    // If the limiter is unreachable, let the request through. A quote form that
    // rejects genuine buyers because Redis is down is a worse failure than one
    // that briefly accepts too many.
    return null;
  }
}

export async function rateLimit(
  identifier: string,
  max = 5,
  bucket = "quote",
): Promise<LimitResult> {
  const key = `pinhigh:${bucket}:${identifier}`;
  const remote = await upstashLimit(key, max);
  return remote ?? memoryLimit(key, max);
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/* -------------------------------------------------------------------------
   Turnstile (§7.2)
   ---------------------------------------------------------------------- */

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // Not configured means not enforced. A secret without a site key cannot
  // render a widget, so requiring a token would block every real buyer.
  if (!secret || !siteKey) return true;
  if (!token) return false;

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
        cache: "no-store",
      },
    );
    const result = (await response.json()) as { success: boolean };
    return Boolean(result.success);
  } catch {
    return true;
  }
}
