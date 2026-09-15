import "server-only";
import { cookies } from "next/headers";
import type { AdminRole, AdminUser } from "@/lib/repo/admin-users";
import { getAdminUserById } from "@/lib/repo/admin-users";
import { createToken, readToken } from "@/lib/session-token";

/**
 * Admin sessions (spec §9, §11).
 *
 * A signed, HTTP-only, 12-hour cookie in front of per-user accounts with a
 * second factor (see `lib/admin-auth`). Middleware checks the cookie exists
 * on every /admin route; each page re-verifies the signature here, because
 * the Edge runtime has neither the secret nor node:crypto.
 *
 * Two cookies, two token kinds (see `lib/session-token`):
 *   ph_admin      the session — issued only once both factors have passed
 *   ph_admin_mfa  a ten-minute marker between the password step and the
 *                 code step, so the code page knows who is mid-way through.
 *                 It is never accepted where a session is required.
 */

const COOKIE = "ph_admin";
const MFA_COOKIE = "ph_admin_mfa";
const SESSION_HOURS = 12;
const MFA_MINUTES = 10;

export interface Session {
  uid: string;
  email: string;
  role: AdminRole;
  exp: number;
}

export interface PendingMfa {
  uid: string;
  email: string;
  exp: number;
}

export function createSessionToken(session: Session): string {
  return createToken("session", session);
}

export function readSessionToken(token: string | undefined): Session | null {
  const session = readToken<Session>("session", token);
  if (!session || typeof session.uid !== "string" || !session.uid) return null;
  if (session.role !== "owner" && session.role !== "staff") return null;
  return session;
}

export function sessionFor(user: AdminUser): Session {
  return {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + SESSION_HOURS * 3_600_000,
  };
}

/* -- Session cookie ------------------------------------------------------- */

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readSessionToken(store.get(COOKIE)?.value);
}

/**
 * The session plus the live account behind it. Removing someone's access
 * must take effect now, not when their cookie expires, so admin pages and
 * actions check the row, not just the signature.
 */
export async function getVerifiedSession(): Promise<(Session & { user: AdminUser }) | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await getAdminUserById(session.uid);
  if (!user || !user.is_active) return null;
  return { ...session, email: user.email, role: user.role, user };
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

/* -- Between the two factors ---------------------------------------------- */

export async function setPendingMfa(user: AdminUser): Promise<void> {
  const store = await cookies();
  const pending: PendingMfa = {
    uid: user.id,
    email: user.email,
    exp: Date.now() + MFA_MINUTES * 60_000,
  };
  store.set(MFA_COOKIE, createToken("mfa", pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: MFA_MINUTES * 60,
  });
}

export async function readPendingMfa(): Promise<PendingMfa | null> {
  const store = await cookies();
  const pending = readToken<PendingMfa>("mfa", store.get(MFA_COOKIE)?.value);
  return pending && typeof pending.uid === "string" && pending.uid ? pending : null;
}

export async function clearPendingMfa(): Promise<void> {
  const store = await cookies();
  store.delete({ name: MFA_COOKIE, path: "/admin" });
}

export const SESSION_COOKIE = COOKIE;

export { adminConfigured } from "@/lib/admin-auth";
