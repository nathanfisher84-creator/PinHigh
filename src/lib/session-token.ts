import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Signed, expiring tokens for the two admin cookies.
 *
 * Both are HMAC-SHA256 under ADMIN_SESSION_SECRET, so each carries a `kind`
 * inside the signed payload and readers demand the kind they expect. Without
 * that, a ten-minute "password accepted, code pending" marker would verify
 * as a full session — which is exactly the bypass a second factor exists to
 * prevent. Kept free of Next imports so it can be tested under plain node.
 */

export type TokenKind = "session" | "mfa";

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (value && value.length >= 32) return value;
  // A per-boot random secret means sessions do not survive a restart, which is
  // a safe failure: the owner logs in again rather than the site shipping with
  // a predictable signing key.
  globalThis.__phSessionSecret ??= randomBytes(32).toString("hex");
  return globalThis.__phSessionSecret;
}

declare global {
  // eslint-disable-next-line no-var
  var __phSessionSecret: string | undefined;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createToken<T extends object>(kind: TokenKind, data: T): string {
  const payload = Buffer.from(JSON.stringify({ ...data, kind })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The payload if the signature holds, the kind matches and it has not expired. */
export function readToken<T extends { exp: number }>(kind: TokenKind, token: string | undefined): T | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Constant-time compare — a length mismatch is checked first because
  // timingSafeEqual throws on unequal buffers.
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { kind?: unknown };
    if (data.kind !== kind) return null;
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
