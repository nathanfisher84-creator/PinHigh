import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { listAdminUsers } from "@/lib/repo/admin-users";
import { emailConfigured } from "@/lib/notify/email";
import { UserManager } from "@/components/admin/UserManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") redirect("/admin");

  const [users, canEmail] = await Promise.all([listAdminUsers(), emailConfigured()]);

  return (
    <div>
      <h1 className="text-2xl">Who can sign in</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite-ink">
        Everyone here has their own password and authenticator app. Owners can
        add and remove people; staff can do everything else. Nobody needs the
        developer to change this list.
      </p>

      <UserManager users={users} me={session.uid} canEmail={canEmail} />
    </div>
  );
}
