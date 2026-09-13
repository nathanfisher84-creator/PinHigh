import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238) on Node builtins.
 *
 * This is the second factor spec §2 requires for every admin account. It is
 * deliberately the plain standard — SHA-1, 6 digits, 30-second steps — because
 * that is what every authenticator app on the owner's phone speaks, and the
 * one thing an MFA implementation must never be is clever.
 *
 * Recovery codes are the escape hatch for a lost phone. They are shown once
 * at enrolment and stored hashed, exactly like passwords: a database dump
 * must not be enough to bypass the second factor.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, the size RFC 4226 recommends for SHA-1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): HMAC-SHA1 over the big-endian 8-byte counter. */
export function hotp(secret: Buffer, counter: bigint, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totpCounter(timeMs: number, step = TOTP_STEP_SECONDS): bigint {
  return BigInt(Math.floor(timeMs / 1000 / step));
}

export function totp(
  secretBase32: string,
  timeMs = Date.now(),
  digits = TOTP_DIGITS,
  step = TOTP_STEP_SECONDS,
): string {
  return hotp(base32Decode(secretBase32), totpCounter(timeMs, step), digits);
}

/**
 * Check a code against the current step and one either side — phones drift.
 * Returns the matching counter so the caller can refuse a replay of the same
 * code within its window, or null when nothing matched.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { timeMs?: number; window?: number; notBefore?: bigint | null } = {},
): bigint | null {
  const digitsOnly = code.replace(/\D/g, "");
  if (digitsOnly.length !== TOTP_DIGITS) return null;

  const secret = base32Decode(secretBase32);
  const centre = totpCounter(opts.timeMs ?? Date.now());
  const window = opts.window ?? 1;
  const given = Buffer.from(digitsOnly);

  for (let delta = -window; delta <= window; delta++) {
    const counter = centre + BigInt(delta);
    if (counter < 0n) continue;
    if (opts.notBefore != null && counter <= opts.notBefore) continue;
    const expected = Buffer.from(hotp(secret, counter));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return counter;
    }
  }
  return null;
}

/** The URI an authenticator app reads from the QR code. */
export function otpauthUri(opts: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Secret shown for manual entry: groups of four, easier to type. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/* -------------------------------------------------------------------------
   Recovery codes
   ---------------------------------------------------------------------- */

// No 0/O, 1/I/L: a code read over the phone from a printout must be
// unambiguous.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 8;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(12);
    let raw = "";
    for (const b of bytes) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return codes;
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Recovery codes carry ~60 bits of entropy, so a plain SHA-256 is enough. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
}

/** Index of the matching unused code, or -1. Constant-time per comparison. */
export function findRecoveryCode(code: string, hashes: string[]): number {
  const given = Buffer.from(hashRecoveryCode(code));
  for (let i = 0; i < hashes.length; i++) {
    const h = Buffer.from(hashes[i]);
    if (h.length === given.length && timingSafeEqual(h, given)) return i;
  }
  return -1;
}
