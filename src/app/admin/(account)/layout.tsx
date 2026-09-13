import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Pin High Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Security and Help: signed in, but not yet behind the second-factor gate,
 * because this is where the second factor gets set up and where the "I've
 * lost my phone" instructions live.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/admin/login");

  return (
    <AdminShell email={session.email} role={session.role}>
      {children}
    </AdminShell>
  );
}
