/**
 * Admin accounts end to end against a throwaway PGlite store: bootstrap
 * from the environment, own password, second factor with replay refusal
 * and recovery codes, invitations, resets, and the last-owner guard.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.PINHIGH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pinhigh-auth-"));
process.env.ADMIN_EMAIL = "Owner@Example.com";
process.env.ADMIN_PASSWORD = "bootstrap-password-1";
process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef-test";

const auth = await import("@/lib/admin-auth");
const users = await import("@/lib/repo/admin-users");
const { totp } = await import("@/lib/totp");

const OWNER = "owner@example.com";
const OWN_PASSWORD = "my-own-password-xyz";

describe("bootstrap and first factor", () => {
  test("the environment pair becomes the owner row, email normalised", async () => {
    const user = await auth.verifyCredentials("  OWNER@example.com ", "bootstrap-password-1");
    assert.ok(user);
    assert.equal(user.email, OWNER);
    assert.equal(user.role, "owner");
    assert.equal(await users.countAdminUsers(), 1);
    assert.ok(auth.usesBootstrapPassword(user));
  });

  test("wrong password and unknown email both fail the same way", async () => {
    assert.equal(await auth.verifyCredentials(OWNER, "nope-nope-nope"), null);
    assert.equal(await auth.verifyCredentials("nobody@example.com", "bootstrap-password-1"), null);
  });

  test("choosing a password retires the environment one", async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    const short = await auth.changePassword(owner.id, "bootstrap-password-1", "short");
    assert.equal(short.ok, false);
    const wrong = await auth.changePassword(owner.id, "wrong-current-pw", OWN_PASSWORD);
    assert.equal(wrong.ok, false);
    const ok = await auth.changePassword(owner.id, "bootstrap-password-1", OWN_PASSWORD);
    assert.equal(ok.ok, true);

    assert.equal(await auth.verifyCredentials(OWNER, "bootstrap-password-1"), null);
    assert.ok(await auth.verifyCredentials(OWNER, OWN_PASSWORD));
  });
});

describe("second factor", () => {
  let recovery: string[] = [];

  test("enrolment needs a matching code, then hands over recovery codes once", async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    assert.equal(auth.mfaEnrolmentAvailable(), true);

    const begun = await auth.beginMfaEnrolment(owner.id);
    assert.ok("secret" in begun);
    assert.match(begun.uri, /^otpauth:\/\/totp\//);

    // Reloading the page shows the same secret, not a new one.
    const again = await auth.pendingMfaEnrolment(owner.id);
    assert.equal(again?.secret, begun.secret);

    const bad = await auth.confirmMfaEnrolment(owner.id, "000000");
    assert.equal(bad.ok, false);
    // Not enabled until a real code lands.
    assert.equal((await users.getAdminUserById(owner.id))!.mfa_enabled, 0);

    const good = await auth.confirmMfaEnrolment(owner.id, totp(begun.secret));
    assert.ok(good.ok);
    recovery = good.recoveryCodes;
    assert.equal(recovery.length, 8);
    assert.equal((await users.getAdminUserById(owner.id))!.mfa_enabled, 1);
  });

  test("an app code works once; a replay inside its window is refused", async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    // The enrolment code's counter is already recorded, so move one step on.
    const later = Date.now() + 30_000;
    const secret = (await auth.pendingMfaEnrolment(owner.id)) ?? null;
    assert.equal(secret, null, "enrolment is finished, nothing pending");

    const { openSecret } = await import("@/lib/secrets");
    const raw = openSecret((await users.getAdminUserById(owner.id))!.totp_secret!)!;
    const code = totp(raw, later);

    // Our verifier uses the real clock; a code for +30s is inside the ±1 window.
    const first = await auth.verifySecondFactor(owner.id, code);
    assert.deepEqual(first, { ok: true, via: "totp" });
    const replay = await auth.verifySecondFactor(owner.id, code);
    assert.equal(replay.ok, false);
  });

  test("a recovery code works exactly once and reports what's left", async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    const typed = recovery[0].toLowerCase();
    const used = await auth.verifySecondFactor(owner.id, typed);
    assert.deepEqual(used, { ok: true, via: "recovery", remaining: 7 });
    const twice = await auth.verifySecondFactor(owner.id, typed);
    assert.equal(twice.ok, false);
    const garbage = await auth.verifySecondFactor(owner.id, "zzzz-zzzz-zzzz");
    assert.equal(garbage.ok, false);
  });

  test("regenerating recovery codes invalidates the old set", async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    const fresh = await auth.regenerateRecoveryCodes(owner.id);
    assert.equal(fresh?.length, 8);
    const old = await auth.verifySecondFactor(owner.id, recovery[1]);
    assert.equal(old.ok, false);
    const nu = await auth.verifySecondFactor(owner.id, fresh![0]);
    assert.equal(nu.ok, true);
  });
});

describe("invitations, resets and the owner's controls", () => {
  const actor = async () => {
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    return { uid: owner.id, email: owner.email, role: owner.role };
  };

  test("an invite makes a pending account that cannot sign in until redeemed", async () => {
    const inv = await auth.createInvite(await actor(), "Staff@Example.com", "staff");
    assert.ok(inv.ok);
    assert.equal(inv.user.email, "staff@example.com");
    assert.equal(await auth.verifyCredentials("staff@example.com", "anything-at-all"), null);
    assert.equal(await auth.verifyCredentials("staff@example.com", "bootstrap-password-1"), null);

    const list = await users.listAdminUsers();
    const staff = list.find((u) => u.email === "staff@example.com")!;
    assert.equal(staff.pending_invite, true);
    assert.equal(staff.has_password, false);

    const peek = await auth.peekToken(inv.token, "invite");
    assert.equal(peek?.email, "staff@example.com");
    assert.equal(await auth.peekToken(inv.token, "reset"), null, "purpose is checked");

    const weak = await auth.redeemToken(inv.token, "invite", "short");
    assert.equal(weak.ok, false);
    const done = await auth.redeemToken(inv.token, "invite", "staff-password-123");
    assert.ok(done.ok);
    assert.ok(await auth.verifyCredentials("staff@example.com", "staff-password-123"));

    // One use only.
    const again = await auth.redeemToken(inv.token, "invite", "another-password-1");
    assert.equal(again.ok, false);
  });

  test("staff cannot invite, deactivate or promote", async () => {
    const staff = (await users.getAdminUserByEmail("staff@example.com"))!;
    const who = { uid: staff.id, email: staff.email, role: staff.role };
    assert.equal((await auth.createInvite(who, "x@example.com", "staff")).ok, false);
    const owner = (await users.getAdminUserByEmail(OWNER))!;
    assert.equal((await auth.setUserActive(who, owner.id, false)).ok, false);
    assert.equal((await auth.setUserRole(who, staff.id, "owner")).ok, false);
  });

  test("inviting an existing active account is refused", async () => {
    const dup = await auth.createInvite(await actor(), "staff@example.com", "staff");
    assert.equal(dup.ok, false);
  });

  test("a forgotten password is a one-hour link; expired links are dead", async () => {
    const reset = await auth.createPasswordReset("staff@example.com");
    assert.ok(reset);
    const done = await auth.redeemToken(reset.token, "reset", "brand-new-password-9");
    assert.ok(done.ok);
    assert.ok(await auth.verifyCredentials("staff@example.com", "brand-new-password-9"));
    assert.equal(await auth.verifyCredentials("staff@example.com", "staff-password-123"), null);

    assert.equal(await auth.createPasswordReset("ghost@example.com"), null);

    const staff = (await users.getAdminUserByEmail("staff@example.com"))!;
    const expired = await users.issueToken(staff.id, "reset", -1);
    assert.equal(await auth.peekToken(expired, "reset"), null);
  });

  test("the last owner can be neither removed nor demoted; others can", async () => {
    const me = await actor();
    const staff = (await users.getAdminUserByEmail("staff@example.com"))!;
    assert.equal((await auth.setUserActive(me, me.uid, false)).ok, false, "not yourself");
    assert.equal((await auth.setUserRole(me, me.uid, "staff")).ok, false, "last owner");

    assert.ok((await auth.setUserRole(me, staff.id, "owner")).ok);
    assert.ok((await auth.setUserRole(me, me.uid, "staff")).ok, "now there is another owner");
    // Put it back so later assertions still act as owner.
    const them = { uid: staff.id, email: staff.email, role: "owner" as const };
    assert.ok((await auth.setUserRole(them, me.uid, "owner")).ok);

    const off = await auth.setUserActive(me, staff.id, false);
    assert.ok(off.ok);
    assert.equal(await auth.verifyCredentials("staff@example.com", "brand-new-password-9"), null);
    const on = await auth.setUserActive(me, staff.id, true);
    assert.ok(on.ok);
    assert.ok(await auth.verifyCredentials("staff@example.com", "brand-new-password-9"));
  });

  test("an owner can reset a colleague's second factor", async () => {
    const me = await actor();
    const staff = (await users.getAdminUserByEmail("staff@example.com"))!;
    const begun = await auth.beginMfaEnrolment(staff.id);
    assert.ok("secret" in begun);
    assert.ok((await auth.confirmMfaEnrolment(staff.id, totp(begun.secret))).ok);
    assert.equal((await users.getAdminUserById(staff.id))!.mfa_enabled, 1);

    assert.ok((await auth.resetUserMfa(me, staff.id)).ok);
    const after = (await users.getAdminUserById(staff.id))!;
    assert.equal(after.mfa_enabled, 0);
    assert.equal(after.totp_secret, null);
    // Without a second factor enrolled, the check passes straight through.
    assert.deepEqual(await auth.verifySecondFactor(staff.id, "whatever"), { ok: true, via: "totp" });
  });
});
