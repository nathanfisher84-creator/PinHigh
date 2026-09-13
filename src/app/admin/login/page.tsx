import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminConfigured } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<{ next?: string }>;

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;

  // Already signed in — no reason to show a login form.
  if (await getSession()) redirect(next ?? "/admin");

  const configured = await adminConfigured();

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        <h1 className="mt-8 text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-graphite-ink">
          Stock, quote requests and settings for pinhighuae.com.
        </p>

        {configured ? (
          <LoginForm next={next ?? "/admin"} />
        ) : (
          <p className="mt-8 hairline border-flag bg-flag-wash px-4 py-3 text-sm" role="alert">
            <strong>No admin account exists yet.</strong> For the very first
            sign-in, set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in
            the deployment’s environment. After that, accounts are managed from
            inside the panel.
          </p>
        )}
      </div>
    </div>
  );
}
