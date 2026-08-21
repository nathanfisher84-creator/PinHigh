import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * At-rest encryption for owner-entered secrets (the Gmail app password).
 *
 * The owner types these into the admin panel so the developer never has to
 * hold them. They must survive in the database, but a database dump alone
 * must not surrender them — so they are sealed with AES-256-GCM under a key
 * derived from ADMIN_SESSION_SECRET, which lives only in the deployment's
 * environment. Someone with the database but not the environment gets
 * ciphertext; someone with the environment but not the database gets nothing.
 *
 * If ADMIN_SESSION_SECRET ever changes, stored secrets stop decrypting and
 * the owner re-enters them — a safe failure, surfaced in the settings UI.
 */

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return scryptSync(secret, "pinhigh-secrets-v1", 32);
}

/** False when there is no stable secret to seal under — refuse to store. */
export function canStoreSecrets(): boolean {
  return key() !== null;
}

export function sealSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("ADMIN_SESSION_SECRET must be set before secrets can be stored.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function openSecret(sealed: string): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  const k = key();
  if (!k) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    // Wrong or rotated key: treat as not configured rather than crashing.
    return null;
  }
}
