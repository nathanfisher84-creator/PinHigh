import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { logout } from "@/app/admin/actions";
import type { AdminRole } from "@/lib/repo/admin-users";

/**
 * The admin chrome, shared by the two route groups under /admin:
 * `(protected)` — every working page, behind the second-factor gate — and
 * `(account)` — Security and Help, reachable before the second factor is
 * set up, because that is where you set it up.
 */
export function AdminShell({
  email,
  role,
  notice,
  children,
}: {
  email: string;
  role: AdminRole;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
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
              <Link href="/" target="_blank" className="text-graphite-ink hover:text-fairway">
                View site
              </Link>
              <Link
                href="/admin/security"
                className="hidden sm:inline text-graphite-ink hover:text-fairway"
                title="Your password and authenticator"
              >
                {email}
              </Link>
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

          <AdminNav role={role} />
        </div>
      </header>

      {notice}

      <main className="mx-auto max-w-[100rem] px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
