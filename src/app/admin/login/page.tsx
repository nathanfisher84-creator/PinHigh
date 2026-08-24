import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
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

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        <h1 className="mt-8 text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-graphite-ink">
          Stock, quote requests and settings for pinhighuae.com.
        </p>

        <LoginForm next={next ?? "/admin"} />
      </div>
    </div>
  );
}
