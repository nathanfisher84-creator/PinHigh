import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Admin authentication (spec §9, §11).
 *
 * Spec §2 specifies Supabase Auth — invite-only, no public sign-up, MFA
 * required. That needs a provisioned Supabase project, so what is implemented
 * here is the session layer that sits in front of it: a signed, HTTP-only,
 * expiring cookie with a 12-hour timeout, checked by middleware on every
 * /admin route.
 *
 * `verifyCredentials` is the seam to replace with `supabase.auth.signInWith…`
 * plus an MFA challenge. Everything else — the cookie, the middleware, the
 * timeout, the audit trail — stays as it is.
 *
 * IMPORTANT before cutover: this must not ship as the only gate. It has no MFA
 * and no per-user accounts, which §2 requires. See README "Before cutover".
 */

const COOKIE = "ph_admin";
const SESSION_HOURS = 12;

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

interface Session {
  email: string;
  role: "owner" | "staff";
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Constant-time compare — a length mismatch is checked first because
  // timingSafeEqual throws on unequal buffers.
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (!session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Credential check. Deliberately the only place a password is compared, so
 * swapping to Supabase Auth touches one function.
 */
export function verifyCredentials(email: string, password: string): Session | null {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return null;
  if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) return null;

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return {
    email: adminEmail,
    role: "owner",
    exp: Date.now() + SESSION_HOURS * 3_600_000,
  };
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readSessionToken(store.get(COOKIE)?.value);
}

export async function setSession(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/** True when no admin credentials are configured at all. */
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}
