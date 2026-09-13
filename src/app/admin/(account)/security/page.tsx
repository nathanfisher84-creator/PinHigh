import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import {
  beginMfaEnrolment,
  mfaEnrolmentAvailable,
  pendingMfaEnrolment,
  usesBootstrapPassword,
} from "@/lib/admin-auth";
import { readRecoveryHashes } from "@/lib/repo/admin-users";
import { qrSvg } from "@/lib/qr";
import { formatSecretForDisplay } from "@/lib/totp";
import { PasswordSettings } from "@/components/admin/OwnerSettings";
import { MfaPanel } from "@/components/admin/MfaPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security" };

type SearchParams = Promise<{ setup?: string; recovery?: string }>;

export default async function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/admin/login");
  const { setup, recovery } = await searchParams;
  const user = session.user;

  // Someone sent here to set up their authenticator should see the QR code
  // straight away, not a button to ask for one. Enrolment that is already in
  // progress is reused, so a reload never rotates the secret under them.
  let enrolment = user.mfa_enabled ? null : await pendingMfaEnrolment(user.id);
  if (!enrolment && !user.mfa_enabled && mfaEnrolmentAvailable()) {
    const begun = await beginMfaEnrolment(user.id);
    if ("secret" in begun) enrolment = begun;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl">Security</h1>
      <p className="mt-2 text-sm text-graphite-ink">
        Your own sign-in: <span className="tabular">{user.email}</span>
      </p>

      {setup === "required" && !user.mfa_enabled && (
        <div className="mt-6 hairline border-flag bg-flag-wash px-4 py-3 text-sm" role="status">
          <strong>One thing before you carry on.</strong> Every account needs an
          authenticator app as well as a password. It takes a minute — scan the
          code below.
        </div>
      )}

      {recovery !== undefined && (
        <div className="mt-6 hairline border-flag bg-flag-wash px-4 py-3 text-sm" role="status">
          <strong>You signed in with a recovery code.</strong> You have{" "}
          {recovery} left. If you’ve lost your phone, set the authenticator up
          again on the new one below; if you were just testing, carry on.
        </div>
      )}

      <div className="mt-8 space-y-8">
        <MfaPanel
          enabled={Boolean(user.mfa_enabled)}
          available={mfaEnrolmentAvailable()}
          recoveryRemaining={readRecoveryHashes(user).length}
          enrolment={
            enrolment
              ? {
                  qrSvg: qrSvg(enrolment.uri),
                  manualKey: formatSecretForDisplay(enrolment.secret),
                }
              : null
          }
        />
        <PasswordSettings hasOwnPassword={!usesBootstrapPassword(user)} />
      </div>
    </div>
  );
}
