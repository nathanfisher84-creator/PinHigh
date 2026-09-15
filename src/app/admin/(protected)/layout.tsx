import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { mfaEnrolmentAvailable } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Pin High Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell (spec §9).
 *
 * Everything under this route group is gated. `/admin/login` deliberately sits
 * outside it, so the login page cannot end up behind its own gate.
 *
 * Middleware only checks that a session cookie *exists* — it runs on the Edge
 * runtime, where the signing secret and node:crypto are not available. This is
 * where the cookie is actually verified, against the live account row, so
 * every admin page is behind a real signature check and removed access takes
 * effect immediately.
 *
 * Spec §2 requires a second factor on every account. Someone signed in with a
 * password alone is sent to set one up before they see anything else — unless
 * the deployment cannot store one yet, in which case the shell says so rather
 * than locking the owner out of their own site.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/admin/login");

  if (!session.user.mfa_enabled && mfaEnrolmentAvailable()) {
    redirect("/admin/security?setup=required");
  }

  const notice = !session.user.mfa_enabled ? (
    <div className="border-b border-flag bg-flag-wash px-4 py-2 text-center text-sm">
      <strong>No second factor on this account.</strong> The deployment is missing
      ADMIN_SESSION_SECRET, so one can’t be stored yet — ask your developer to set
      it, then set up your authenticator under Security.
    </div>
  ) : null;

  return (
    <AdminShell email={session.email} role={session.role} notice={notice}>
      {children}
    </AdminShell>
  );
}
