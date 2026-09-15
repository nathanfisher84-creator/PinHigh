import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { all, get, run, uid, now } from "@/lib/db";

/**
 * Admin accounts (spec §2, §9).
 *
 * One row per person who can sign in. The owner manages these from the
 * panel — inviting a colleague, removing one, resetting a lost second
 * factor — so nobody has to edit the deployment's environment to change
 * who has access.
 *
 * What is stored, and how:
 *   - password_hash    scrypt, `salt:hash` (see admin-auth)
 *   - totp_secret      sealed under ADMIN_SESSION_SECRET (see lib/secrets)
 *   - recovery_codes   JSON array of SHA-256 hashes; a used code is removed
 *   - token_hash       SHA-256 of a one-time invite / reset link token
 * None of it is useful on its own to someone holding a database dump.
 */

export type AdminRole = "owner" | "staff";
export type TokenPurpose = "invite" | "reset";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
  password_hash: string | null;
  totp_secret: string | null;
  /** A replacement secret awaiting its first code; the live one stays in force. */
  totp_pending_secret: string | null;
  totp_last_counter: string | null;
  mfa_enabled: number;
  recovery_codes: string | null;
  token_hash: string | null;
  token_purpose: TokenPurpose | null;
  token_expires_at: string | null;
  is_active: number;
  invited_by: string | null;
  last_login_at: string | null;
}

/** What the Users page shows — never a hash or a secret. */
export interface AdminUserSummary {
  id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  mfa_enabled: boolean;
  has_password: boolean;
  pending_invite: boolean;
  invited_by: string | null;
  last_login_at: string | null;
  created_at: string;
}

const COLS =
  "id, email, role, created_at, password_hash, totp_secret, totp_pending_secret, totp_last_counter, " +
  "mfa_enabled, recovery_codes, token_hash, token_purpose, token_expires_at, " +
  "is_active, invited_by, last_login_at";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function countAdminUsers(): Promise<number> {
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM admin_users");
  return Number(row?.n ?? 0);
}

export async function countActiveOwners(): Promise<number> {
  const row = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND is_active = 1",
  );
  return Number(row?.n ?? 0);
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const rows = await all<AdminUser>(
    `SELECT ${COLS} FROM admin_users ORDER BY role ASC, email ASC`,
  );
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    is_active: Boolean(u.is_active),
    mfa_enabled: Boolean(u.mfa_enabled),
    has_password: Boolean(u.password_hash),
    pending_invite: !u.password_hash && u.token_purpose === "invite",
    invited_by: u.invited_by,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
  }));
}

export async function getAdminUserById(id: string): Promise<AdminUser | undefined> {
  return get<AdminUser>(`SELECT ${COLS} FROM admin_users WHERE id = ?`, id);
}

export async function getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
  return get<AdminUser>(`SELECT ${COLS} FROM admin_users WHERE email = ?`, normaliseEmail(email));
}

export async function createAdminUser(input: {
  email: string;
  role: AdminRole;
  password_hash?: string | null;
  invited_by?: string | null;
}): Promise<AdminUser> {
  const id = uid();
  await run(
    `INSERT INTO admin_users (id, email, role, created_at, password_hash, invited_by, is_active, mfa_enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
    id,
    normaliseEmail(input.email),
    input.role,
    now(),
    input.password_hash ?? null,
    input.invited_by ?? null,
  );
  return (await getAdminUserById(id))!;
}

export async function setPasswordHash(id: string, hash: string): Promise<void> {
  await run("UPDATE admin_users SET password_hash = ? WHERE id = ?", hash, id);
}

export async function setRole(id: string, role: AdminRole): Promise<void> {
  await run("UPDATE admin_users SET role = ? WHERE id = ?", role, id);
}

export async function setActive(id: string, active: boolean): Promise<void> {
  await run("UPDATE admin_users SET is_active = ? WHERE id = ?", active ? 1 : 0, id);
}

export async function touchLogin(id: string): Promise<void> {
  await run("UPDATE admin_users SET last_login_at = ? WHERE id = ?", now(), id);
}

/* -- Second factor ------------------------------------------------------- */

/**
 * Store a not-yet-confirmed secret. Nothing about the current second factor
 * changes: an authenticator (and its recovery codes) stays in force until
 * the replacement's first code is confirmed in enableMfa.
 */
export async function setPendingTotp(id: string, sealedSecret: string): Promise<void> {
  await run("UPDATE admin_users SET totp_pending_secret = ? WHERE id = ?", sealedSecret, id);
}

export async function clearPendingTotp(id: string): Promise<void> {
  await run("UPDATE admin_users SET totp_pending_secret = NULL WHERE id = ?", id);
}

/** Promote the pending secret: it becomes the live one, with a fresh set of codes. */
export async function enableMfa(
  id: string,
  recoveryHashes: string[],
  lastCounter: bigint,
): Promise<void> {
  await run(
    `UPDATE admin_users
        SET mfa_enabled = 1,
            totp_secret = totp_pending_secret,
            totp_pending_secret = NULL,
            recovery_codes = ?,
            totp_last_counter = ?
      WHERE id = ? AND totp_pending_secret IS NOT NULL`,
    JSON.stringify(recoveryHashes),
    lastCounter.toString(),
    id,
  );
}

export async function clearMfa(id: string): Promise<void> {
  await run(
    `UPDATE admin_users
        SET mfa_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL,
            recovery_codes = NULL, totp_last_counter = NULL
      WHERE id = ?`,
    id,
  );
}

export async function recordTotpCounter(id: string, counter: bigint): Promise<void> {
  await run("UPDATE admin_users SET totp_last_counter = ? WHERE id = ?", counter.toString(), id);
}

export async function saveRecoveryCodes(id: string, hashes: string[]): Promise<void> {
  await run("UPDATE admin_users SET recovery_codes = ? WHERE id = ?", JSON.stringify(hashes), id);
}

export function readRecoveryHashes(user: AdminUser): string[] {
  try {
    const parsed = user.recovery_codes ? (JSON.parse(user.recovery_codes) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

/* -- One-time links (invite, password reset) ----------------------------- */

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Issue a fresh token; returns the raw value, which is never stored. */
export async function issueToken(id: string, purpose: TokenPurpose, ttlMs: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await run(
    `UPDATE admin_users
        SET token_hash = ?, token_purpose = ?, token_expires_at = ?
      WHERE id = ?`,
    hashToken(raw),
    purpose,
    new Date(Date.now() + ttlMs).toISOString(),
    id,
  );
  return raw;
}

/**
 * The user a live token belongs to, or undefined if unknown, expired, or
 * the account has had its access removed — a link sent before the removal
 * must not be a way back in.
 */
export async function findByToken(raw: string, purpose: TokenPurpose): Promise<AdminUser | undefined> {
  if (!raw || raw.length > 200) return undefined;
  const user = await get<AdminUser>(
    `SELECT ${COLS} FROM admin_users WHERE token_hash = ? AND token_purpose = ? AND is_active = 1`,
    hashToken(raw),
    purpose,
  );
  if (!user || !user.token_expires_at) return undefined;
  if (new Date(user.token_expires_at).getTime() < Date.now()) return undefined;
  return user;
}

export async function clearToken(id: string): Promise<void> {
  await run(
    "UPDATE admin_users SET token_hash = NULL, token_purpose = NULL, token_expires_at = NULL WHERE id = ?",
    id,
  );
}
