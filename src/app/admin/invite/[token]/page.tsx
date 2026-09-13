import type { Metadata } from "next";
import Link from "next/link";
import { peekToken } from "@/lib/admin-auth";
import { SetPasswordForm } from "@/components/admin/SetPasswordForm";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = {
  title: "Set up your access",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await peekToken(token, "invite");

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo size="site" />
        {user ? (
          <>
            <h1 className="mt-8 text-2xl">Welcome to Pin High admin</h1>
            <p className="mt-1 text-sm text-graphite-ink">
              You’re setting up access for <span className="tabular">{user.email}</span>.
              Choose a password; you’ll add an authenticator app next.
            </p>
            <SetPasswordForm token={token} purpose="invite" email={user.email} />
          </>
        ) : (
          <>
            <h1 className="mt-8 text-2xl">This link has expired</h1>
            <p className="mt-1 text-sm text-graphite-ink">
              Invitations work once and last seven days. Ask the person who
              invited you to send a new one.
            </p>
            <p className="mt-6 text-sm">
              <Link href="/admin/login" className="underline underline-offset-2 hover:text-fairway">
                Go to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
