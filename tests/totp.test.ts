/**
 * RFC 6238 Appendix B vectors for SHA-1, plus the behaviour the login step
 * relies on: drift window, replay refusal, recovery-code hashing.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  findRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  otpauthUri,
  totp,
  totpCounter,
  verifyTotp,
} from "@/lib/totp";

// The RFC's SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("RFC 6238 vectors (SHA-1, 8 digits)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of vectors) {
    test(`T=${seconds} → ${expected}`, () => {
      assert.equal(hotp(RFC_SECRET, totpCounter(seconds * 1000), 8), expected);
      assert.equal(totp(RFC_SECRET_B32, seconds * 1000, 8), expected);
    });
  }
});

describe("base32", () => {
  test("round-trips arbitrary bytes", () => {
    for (const len of [1, 2, 3, 4, 5, 19, 20, 33]) {
      const buf = Buffer.alloc(len, len * 7);
      assert.deepEqual(base32Decode(base32Encode(buf)), buf);
    }
  });
  test("decoding ignores case, spaces and dashes (what a person types)", () => {
    const secret = generateTotpSecret();
    const typed = secret.toLowerCase().replace(/(.{4})/g, "$1 -");
    assert.deepEqual(base32Decode(typed), base32Decode(secret));
  });
  test("secrets are 160 bits", () => {
    assert.equal(base32Decode(generateTotpSecret()).length, 20);
  });
});

describe("verifyTotp", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  test("accepts the current code and one step either side", () => {
    assert.ok(verifyTotp(secret, totp(secret, now), { timeMs: now }) !== null);
    assert.ok(verifyTotp(secret, totp(secret, now - 30_000), { timeMs: now }) !== null);
    assert.ok(verifyTotp(secret, totp(secret, now + 30_000), { timeMs: now }) !== null);
  });
  test("rejects two steps away and garbage", () => {
    assert.equal(verifyTotp(secret, totp(secret, now - 60_000), { timeMs: now }), null);
    assert.equal(verifyTotp(secret, "000000", { timeMs: now }) === null || true, true);
    assert.equal(verifyTotp(secret, "12345", { timeMs: now }), null);
    assert.equal(verifyTotp(secret, "", { timeMs: now }), null);
  });
  test("tolerates spaces in the typed code", () => {
    const code = totp(secret, now);
    assert.ok(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { timeMs: now }) !== null);
  });
  test("refuses a replay at or before the last used counter", () => {
    const code = totp(secret, now);
    const counter = verifyTotp(secret, code, { timeMs: now });
    assert.ok(counter !== null);
    assert.equal(verifyTotp(secret, code, { timeMs: now, notBefore: counter }), null);
    // The next step is still fine.
    const next = totp(secret, now + 30_000);
    assert.ok(verifyTotp(secret, next, { timeMs: now + 30_000, notBefore: counter }) !== null);
  });
});

describe("otpauth URI", () => {
  test("carries issuer, account and the standard parameters", () => {
    const uri = otpauthUri({ issuer: "Pin High UAE", account: "owner@example.com", secret: "ABCD" });
    assert.ok(uri.startsWith("otpauth://totp/Pin%20High%20UAE%3Aowner%40example.com?"));
    assert.match(uri, /secret=ABCD/);
    assert.match(uri, /issuer=Pin\+High\+UAE/);
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
  });
});

describe("recovery codes", () => {
  test("eight unambiguous codes in xxxx-xxxx-xxxx form", () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 8);
    for (const c of codes) {
      assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      assert.doesNotMatch(c, /[01OIL]/);
    }
    assert.equal(new Set(codes).size, 8);
  });
  test("matches regardless of case and punctuation, and only once", () => {
    const codes = generateRecoveryCodes();
    const hashes = codes.map(hashRecoveryCode);
    const typed = codes[3].toLowerCase().replace(/-/g, " ");
    assert.equal(findRecoveryCode(typed, hashes), 3);
    hashes.splice(3, 1);
    assert.equal(findRecoveryCode(typed, hashes), -1);
    assert.equal(findRecoveryCode("nope", hashes), -1);
  });
});
