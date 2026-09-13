import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/admin/ForgotForm";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "Forgotten password",
  robots: { index: false, follow: false, nocache: true },
};

export default function ForgotPage() {
  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        <h1 className="mt-8 text-2xl">Forgotten your password?</h1>
        <p className="mt-1 text-sm text-graphite-ink">
          Enter the email you sign in with and we’ll send a link to choose a new
          one. Your authenticator app stays as it is.
        </p>

        <ForgotForm />

        <p className="mt-6 text-center text-sm">
          <Link href="/admin/login" className="text-graphite-ink underline underline-offset-2 hover:text-fairway">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
