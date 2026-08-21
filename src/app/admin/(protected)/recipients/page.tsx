import { all } from "@/lib/db";
import { RecipientManager } from "@/components/admin/RecipientManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipients" };

export interface RecipientRow {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  value: string;
  is_active: number;
}

export default async function AdminRecipientsPage() {
  const recipients = await all<RecipientRow>(
    "SELECT id, name, channel, value, is_active FROM notification_recipients ORDER BY channel ASC, name ASC",
  );

  // Owner-entered Gmail (Settings) counts, not just the environment.
  const { emailConfigured: isEmailConfigured } = await import("@/lib/notify/email");
  const emailConfigured = await isEmailConfigured();

  return (
    <div>
      <h1 className="text-2xl">Who gets notified</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite-ink">
        Everyone active here is emailed the moment a quote request arrives —
        the full summary with a spreadsheet of the lines attached. Add as many
        addresses as you like; buyers never see any of them.
      </p>

      <RecipientManager recipients={recipients} emailConfigured={emailConfigured} />
    </div>
  );
}
