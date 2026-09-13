import type { Metadata } from "next";
import Link from "next/link";
import { peekToken } from "@/lib/admin-auth";
import { SetPasswordForm } from "@/components/admin/SetPasswordForm";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await peekToken(token, "reset");

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        {user ? (
          <>
            <h1 className="mt-8 text-2xl">Choose a new password</h1>
            <p className="mt-1 text-sm text-graphite-ink">
              For <span className="tabular">{user.email}</span>. If you use an
              authenticator app, you’ll be asked for a code afterwards as usual.
            </p>
            <SetPasswordForm token={token} purpose="reset" email={user.email} />
          </>
        ) : (
          <>
            <h1 className="mt-8 text-2xl">This link has expired</h1>
            <p className="mt-1 text-sm text-graphite-ink">
              Reset links work once and last an hour.
            </p>
            <p className="mt-6 text-sm">
              <Link href="/admin/forgot" className="underline underline-offset-2 hover:text-fairway">
                Request a new one
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
