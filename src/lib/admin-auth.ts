import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { audit, getSetting } from "@/lib/db";
import * as users from "@/lib/repo/admin-users";
import type { AdminRole, AdminUser } from "@/lib/repo/admin-users";
import { canStoreSecrets, openSecret, sealSecret } from "@/lib/secrets";
import {
  findRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";

/**
 * Credentials and the second factor (spec §2).
 *
 * Everything here is plain logic over the admin_users table: no cookies, no
 * request context. `lib/auth` wraps it in the session layer. Keeping the two
 * apart is what lets this file be tested under plain Node.
 *
 * Passwords: scrypt, stored as `salt:hash`. The same format the panel's
 * "change password" used before per-user accounts existed, so an owner who
 * had already chosen their own password keeps it across the upgrade.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MFA_ISSUER = "Pin High UAE";
export const INVITE_TTL_MS = 7 * 24 * 3_600_000;
export const RESET_TTL_MS = 60 * 60_000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return "That password is too long.";
  return null;
}

/* -------------------------------------------------------------------------
   Bootstrap
   ---------------------------------------------------------------------- */

/**
 * First boot after this release: the environment's ADMIN_EMAIL becomes the
 * owner row. A password the owner had already set in the panel carries
 * over; otherwise they keep signing in with ADMIN_PASSWORD until they choose
 * one, and the Security page says so.
 */
export async function ensureBootstrapOwner(): Promise<void> {
  if ((await users.countAdminUsers()) > 0) return;
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  const legacy = await getSetting("admin_password_hash");
  await users.createAdminUser({
    email,
    role: "owner",
    password_hash: legacy || null,
  });
  await audit("admin.bootstrap", users.normaliseEmail(email));
}

/** True when someone can sign in at all — an account row, or the bootstrap pair. */
export async function adminConfigured(): Promise<boolean> {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) return true;
  return (await users.countAdminUsers()) > 0;
}

/** Still on the deployment's ADMIN_PASSWORD rather than a chosen one. */
export function usesBootstrapPassword(user: AdminUser): boolean {
  return !user.password_hash;
}

/* -------------------------------------------------------------------------
   First factor
   ---------------------------------------------------------------------- */

/**
 * The only place a password is compared. Returns the account on success;
 * null for every kind of failure, so the login form has one message.
 */
export async function verifyCredentials(email: string, password: string): Promise<AdminUser | null> {
  await ensureBootstrapOwner();
  const user = await users.getAdminUserByEmail(email);
  if (!user || !user.is_active) return null;

  if (user.password_hash) {
    return checkPassword(password, user.password_hash) ? user : null;
  }

  // No password chosen yet. Only the bootstrap owner may use the environment
  // password; an invited colleague who has not set one cannot sign in.
  const envEmail = process.env.ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envEmail || !envPassword) return null;
  if (users.normaliseEmail(envEmail) !== user.email) return null;
  return safeEqual(password, envPassword) ? user : null;
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await users.getAdminUserById(userId);
  if (!user) return { ok: false, message: "Not signed in." };
  if (!(await verifyCredentials(user.email, current))) {
    return { ok: false, message: "The current password isn't right." };
  }
  const problem = passwordProblem(next);
  if (problem) return { ok: false, message: problem };
  await users.setPasswordHash(userId, hashPassword(next));
  await audit("admin.password.changed", user.email, undefined, user.email);
  return { ok: true, message: "Password changed. Existing sign-ins stay valid until they expire." };
}

/* -------------------------------------------------------------------------
   Second factor
   ---------------------------------------------------------------------- */

export function mfaEnrolmentAvailable(): boolean {
  return canStoreSecrets();
}

export interface Enrolment {
  secret: string;
  uri: string;
}

/** Start (or restart) enrolment: a fresh secret, not yet trusted. */
export async function beginMfaEnrolment(userId: string): Promise<Enrolment | { error: string }> {
  if (!canStoreSecrets()) {
    return {
      error:
        "The deployment has no ADMIN_SESSION_SECRET, so a second factor can't be stored yet. Ask your developer to set it.",
    };
  }
  const user = await users.getAdminUserById(userId);
  if (!user) return { error: "Not signed in." };
  const secret = generateTotpSecret();
  await users.setPendingTotp(userId, sealSecret(secret));
  return { secret, uri: otpauthUri({ issuer: MFA_ISSUER, account: user.email, secret }) };
}

/** The enrolment in progress, if the page is reloaded mid-way. */
export async function pendingMfaEnrolment(userId: string): Promise<Enrolment | null> {
  const user = await users.getAdminUserById(userId);
  if (!user || user.mfa_enabled || !user.totp_secret) return null;
  const secret = openSecret(user.totp_secret);
  if (!secret) return null;
  return { secret, uri: otpauthUri({ issuer: MFA_ISSUER, account: user.email, secret }) };
}

export async function confirmMfaEnrolment(
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; message: string }> {
  const user = await users.getAdminUserById(userId);
  if (!user || !user.totp_secret) {
    return { ok: false, message: "Start by scanning the code with your authenticator app." };
  }
  const secret = openSecret(user.totp_secret);
  if (!secret) {
    return { ok: false, message: "The setup expired — start again." };
  }
  const counter = verifyTotp(secret, code);
  if (counter === null) {
    return { ok: false, message: "That code didn't match. Check the app and try the newest one." };
  }
  const codes = generateRecoveryCodes();
  await users.enableMfa(userId, codes.map(hashRecoveryCode), counter);
  await audit("admin.mfa.enabled", user.email, undefined, user.email);
  return { ok: true, recoveryCodes: codes };
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[] | null> {
  const user = await users.getAdminUserById(userId);
  if (!user || !user.mfa_enabled) return null;
  const codes = generateRecoveryCodes();
  await users.saveRecoveryCodes(userId, codes.map(hashRecoveryCode));
  await audit("admin.mfa.recovery_regenerated", user.email, undefined, user.email);
  return codes;
}

export type SecondFactorResult =
  | { ok: true; via: "totp" }
  | { ok: true; via: "recovery"; remaining: number }
  | { ok: false; message: string };

/**
 * Check a code from the authenticator app, or a recovery code. A TOTP code
 * is accepted once: the counter it matched is recorded so the same six
 * digits cannot be replayed inside their window.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<SecondFactorResult> {
  const user = await users.getAdminUserById(userId);
  if (!user || !user.is_active) return { ok: false, message: "Not signed in." };
  if (!user.mfa_enabled) return { ok: true, via: "totp" };

  const trimmed = code.trim();
  const looksLikeTotp = /^\d[\d ]{4,}\d$/.test(trimmed) && trimmed.replace(/\D/g, "").length === 6;

  if (looksLikeTotp) {
    const secret = user.totp_secret ? openSecret(user.totp_secret) : null;
    if (!secret) {
      return {
        ok: false,
        message:
          "The authenticator secret can't be read on this deployment. Use one of your recovery codes, then set the authenticator up again.",
      };
    }
    const notBefore = user.totp_last_counter ? BigInt(user.totp_last_counter) : null;
    const counter = verifyTotp(secret, trimmed, { notBefore });
    if (counter === null) return { ok: false, message: "That code didn't match." };
    await users.recordTotpCounter(userId, counter);
    return { ok: true, via: "totp" };
  }

  const hashes = users.readRecoveryHashes(user);
  const index = findRecoveryCode(trimmed, hashes);
  if (index === -1) return { ok: false, message: "That code didn't match." };
  hashes.splice(index, 1);
  await users.saveRecoveryCodes(userId, hashes);
  await audit("admin.mfa.recovery_used", user.email, { remaining: hashes.length }, user.email);
  return { ok: true, via: "recovery", remaining: hashes.length };
}

/* -------------------------------------------------------------------------
   Managing other accounts (owner only)
   ---------------------------------------------------------------------- */

export interface Actor {
  uid: string;
  email: string;
  role: AdminRole;
}

function requireOwner(actor: Actor): string | null {
  return actor.role === "owner" ? null : "Only an owner can manage accounts.";
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite someone. Returns the raw token for the link; the caller decides
 * whether to email it or show it, depending on whether email is set up.
 */
export async function createInvite(
  actor: Actor,
  email: string,
  role: AdminRole,
): Promise<{ ok: true; user: AdminUser; token: string } | { ok: false; message: string }> {
  const denied = requireOwner(actor);
  if (denied) return { ok: false, message: denied };
  const clean = users.normaliseEmail(email);
  if (!EMAIL_SHAPE.test(clean)) return { ok: false, message: "That doesn't look like an email address." };
  if (role !== "owner" && role !== "staff") return { ok: false, message: "Unknown role." };

  let user = await users.getAdminUserByEmail(clean);
  if (user && user.password_hash && user.is_active) {
    return { ok: false, message: "That person already has an account." };
  }
  if (user) {
    // Re-inviting someone who never finished, or was removed: reactivate
    // and start clean.
    await users.setActive(user.id, true);
    await users.setRole(user.id, role);
    if (!user.password_hash) await users.clearMfa(user.id);
  } else {
    user = await users.createAdminUser({ email: clean, role, invited_by: actor.email });
  }
  const token = await users.issueToken(user.id, "invite", INVITE_TTL_MS);
  await audit("admin.user.invited", clean, { role }, actor.email);
  return { ok: true, user: (await users.getAdminUserById(user.id))!, token };
}

/** A password-reset link for someone who has forgotten theirs. */
export async function createPasswordReset(
  email: string,
): Promise<{ user: AdminUser; token: string } | null> {
  await ensureBootstrapOwner();
  const user = await users.getAdminUserByEmail(email);
  if (!user || !user.is_active) return null;
  const token = await users.issueToken(user.id, "reset", RESET_TTL_MS);
  await audit("admin.password.reset_requested", user.email);
  return { user, token };
}

/** Owner-issued reset link, for when email is not set up or has failed. */
export async function createPasswordResetFor(
  actor: Actor,
  userId: string,
): Promise<{ ok: true; user: AdminUser; token: string } | { ok: false; message: string }> {
  const denied = requireOwner(actor);
  if (denied) return { ok: false, message: denied };
  const user = await users.getAdminUserById(userId);
  if (!user || !user.is_active) return { ok: false, message: "No such account." };
  const token = await users.issueToken(user.id, "reset", RESET_TTL_MS);
  await audit("admin.password.reset_issued", user.email, undefined, actor.email);
  return { ok: true, user, token };
}

export async function peekToken(raw: string, purpose: users.TokenPurpose): Promise<AdminUser | null> {
  return (await users.findByToken(raw, purpose)) ?? null;
}

/** Turn a live invite or reset link into a password. One use only. */
export async function redeemToken(
  raw: string,
  purpose: users.TokenPurpose,
  password: string,
): Promise<{ ok: true; user: AdminUser } | { ok: false; message: string }> {
  const user = await users.findByToken(raw, purpose);
  if (!user) return { ok: false, message: "This link has expired or was already used. Ask for a new one." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: problem };
  await users.setPasswordHash(user.id, hashPassword(password));
  await users.clearToken(user.id);
  await users.setActive(user.id, true);
  await audit(purpose === "invite" ? "admin.user.joined" : "admin.password.reset", user.email);
  return { ok: true, user: (await users.getAdminUserById(user.id))! };
}

export async function setUserActive(
  actor: Actor,
  userId: string,
  active: boolean,
): Promise<{ ok: boolean; message: string }> {
  const denied = requireOwner(actor);
  if (denied) return { ok: false, message: denied };
  const user = await users.getAdminUserById(userId);
  if (!user) return { ok: false, message: "No such account." };
  if (!active && user.id === actor.uid) {
    return { ok: false, message: "You can't remove your own access. Ask another owner." };
  }
  if (!active && user.role === "owner" && user.is_active && (await users.countActiveOwners()) <= 1) {
    return { ok: false, message: "That is the only owner. Make someone else an owner first." };
  }
  await users.setActive(userId, active);
  await audit(active ? "admin.user.reactivated" : "admin.user.deactivated", user.email, undefined, actor.email);
  return { ok: true, message: active ? "Access restored." : "Access removed. Their sign-in stops working now." };
}

export async function setUserRole(
  actor: Actor,
  userId: string,
  role: AdminRole,
): Promise<{ ok: boolean; message: string }> {
  const denied = requireOwner(actor);
  if (denied) return { ok: false, message: denied };
  if (role !== "owner" && role !== "staff") return { ok: false, message: "Unknown role." };
  const user = await users.getAdminUserById(userId);
  if (!user) return { ok: false, message: "No such account." };
  if (role === "staff" && user.role === "owner" && user.is_active && (await users.countActiveOwners()) <= 1) {
    return { ok: false, message: "That is the only owner. Make someone else an owner first." };
  }
  await users.setRole(userId, role);
  await audit("admin.user.role", user.email, { role }, actor.email);
  return { ok: true, message: role === "owner" ? "They are now an owner." : "They are now staff." };
}

/** Owner resets a colleague's lost second factor; they enrol again at next sign-in. */
export async function resetUserMfa(
  actor: Actor,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const denied = requireOwner(actor);
  if (denied) return { ok: false, message: denied };
  const user = await users.getAdminUserById(userId);
  if (!user) return { ok: false, message: "No such account." };
  await users.clearMfa(userId);
  await audit("admin.mfa.reset", user.email, undefined, actor.email);
  return { ok: true, message: "Authenticator removed. They'll set a new one up when they next sign in." };
}
