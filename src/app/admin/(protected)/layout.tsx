import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, adminConfigured } from "@/lib/auth";
import { Logo } from "@/components/shell/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { logout } from "@/app/admin/actions";

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
 * where the cookie is actually verified, so every admin page is behind a real
 * signature check rather than a presence check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-sand bg-paper-raised">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/admin" aria-label="Admin home">
                <Logo size="compact" />
              </Link>
              <span className="label-caps hidden sm:inline">Admin</span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                target="_blank"
                className="text-graphite-ink hover:text-fairway"
              >
                View site
              </Link>
              <span className="hidden sm:inline text-graphite-ink">{session?.email}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="hairline px-3 py-1.5 hover:border-flag hover:text-flag-ink transition-colors duration-150"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <AdminNav />
        </div>
      </header>

      {!adminConfigured() && (
        <div className="border-b border-flag bg-flag-wash px-4 py-2 text-center text-sm">
          <strong>No admin credentials are set.</strong> Add ADMIN_EMAIL and
          ADMIN_PASSWORD to the environment before this goes anywhere public.
        </div>
      )}

      <main className="mx-auto max-w-[100rem] px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
