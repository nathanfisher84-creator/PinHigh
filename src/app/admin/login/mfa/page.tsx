import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, readPendingMfa } from "@/lib/auth";
import { MfaForm } from "@/components/admin/MfaForm";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "Enter your code",
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<{ next?: string }>;

export default async function MfaPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/admin") ? next : "/admin";
  if (await getSession()) redirect(safeNext);

  const pending = await readPendingMfa();
  if (!pending) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        <h1 className="mt-8 text-2xl">One more step</h1>
        <p className="mt-1 text-sm text-graphite-ink">
          Signing in as <span className="tabular">{pending.email}</span>. Open your
          authenticator app and enter the six-digit code for Pin High.
        </p>

        <MfaForm next={safeNext} />
      </div>
    </div>
  );
}
