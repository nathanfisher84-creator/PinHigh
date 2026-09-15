/**
 * The two admin cookies must never be interchangeable: a pending-MFA marker
 * that verified as a session would let a password alone through.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef-token-test";
const { createToken, readToken } = await import("@/lib/session-token");

describe("session tokens", () => {
  const exp = Date.now() + 60_000;

  test("a token reads back under its own kind", () => {
    const t = createToken("session", { uid: "u1", email: "a@b.c", role: "owner", exp });
    assert.deepEqual(readToken("session", t), { uid: "u1", email: "a@b.c", role: "owner", exp, kind: "session" });
  });

  test("an MFA marker is refused where a session is required, and vice versa", () => {
    const mfa = createToken("mfa", { uid: "u1", email: "a@b.c", exp });
    assert.equal(readToken("session", mfa), null);
    const session = createToken("session", { uid: "u1", email: "a@b.c", role: "owner", exp });
    assert.equal(readToken("mfa", session), null);
  });

  test("the kind is inside the signature — it cannot be edited in", () => {
    const mfa = createToken("mfa", { uid: "u1", email: "a@b.c", exp });
    const [payload, sig] = mfa.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), kind: "session" }),
    ).toString("base64url");
    assert.equal(readToken("session", `${forged}.${sig}`), null);
  });

  test("expired, malformed and re-signed tokens are refused", () => {
    assert.equal(readToken("session", createToken("session", { uid: "u1", exp: Date.now() - 1 })), null);
    assert.equal(readToken("session", "garbage"), null);
    assert.equal(readToken("session", undefined), null);
    const t = createToken("session", { uid: "u1", exp });
    assert.equal(readToken("session", t.slice(0, -2) + "zz"), null);
  });
});
