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

export default function AdminRecipientsPage() {
  const recipients = all<RecipientRow>(
    "SELECT id, name, channel, value, is_active FROM notification_recipients ORDER BY channel ASC, name ASC",
  );

  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL);
  const whatsappConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_TEMPLATE_NAME,
  );

  return (
    <div>
      <h1 className="text-2xl">Who gets notified</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite-ink">
        Everyone active here is told the moment a quote request arrives. Email
        carries the full summary and a spreadsheet of the lines; WhatsApp carries
        the headline so someone picks it up fast.
      </p>

      <RecipientManager
        recipients={recipients}
        emailConfigured={emailConfigured}
        whatsappConfigured={whatsappConfigured}
      />
    </div>
  );
}
