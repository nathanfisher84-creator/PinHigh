import "server-only";
import { all } from "@/lib/db";
import type { NotificationLog, QuoteRequestWithLines } from "@/lib/domain/types";
import { recordNotification } from "@/lib/repo/quotes";
import { emailConfigured, sendQuoteEmail } from "./email";
import { sendQuoteWhatsApp } from "./whatsapp";

/**
 * Notification dispatch (spec §7.3).
 *
 * The governing rule from §7.2 step 5: "Notification failure must never fail
 * the request — it is already committed." Everything here is therefore
 * best-effort, records per-recipient status, and reports rather than throws.
 *
 * When a channel is not configured, recipients are recorded as `skipped` with
 * the reason. That is deliberately different from `failed`: a channel nobody
 * has set up yet should not light up the dashboard's failure panel, but it
 * must still be visible so the owner knows nothing went out.
 */

export interface Recipient {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  value: string;
}

async function activeRecipients(channel: "email" | "whatsapp"): Promise<Recipient[]> {
  return await all<Recipient>(
    `SELECT id, name, channel, value FROM notification_recipients
      WHERE channel = ? AND is_active = 1`,
    channel,
  );
}

export interface DispatchResult {
  email: NotificationLog;
  whatsapp: NotificationLog;
}

/** Exponential backoff: 3 attempts, ~1s then ~4s (§7.3). */
const MAX_ATTEMPTS = 3;

async function withRetry(
  fn: () => Promise<void>,
): Promise<{ status: "sent" | "failed"; detail?: string; attempts: number }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await fn();
      return { status: "sent", attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * attempt ** 2));
      }
    }
  }
  return { status: "failed", detail: lastError, attempts: MAX_ATTEMPTS };
}

export async function dispatchQuoteNotifications(
  quote: QuoteRequestWithLines,
): Promise<DispatchResult> {
  const at = new Date().toISOString();

  const emailLog: NotificationLog = [];
  const whatsappLog: NotificationLog = [];

  const canEmail = emailConfigured();
  const whatsappConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_TEMPLATE_NAME,
  );

  /* -- Email: the system of record (§7.3) ------------------------------- */
  for (const recipient of (await activeRecipients("email"))) {
    if (!canEmail) {
      emailLog.push({
        recipient: recipient.value,
        name: recipient.name,
        status: "skipped",
        detail: "Email is not configured yet. Set GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY and ORDER_FROM_EMAIL).",
        attempts: 0,
        at,
      });
      continue;
    }
    const result = await withRetry(() => sendQuoteEmail(quote, recipient));
    emailLog.push({ recipient: recipient.value, name: recipient.name, ...result, at });
  }

  /* -- WhatsApp ---------------------------------------------------------- */
  for (const recipient of (await activeRecipients("whatsapp"))) {
    if (!whatsappConfigured) {
      whatsappLog.push({
        recipient: recipient.value,
        name: recipient.name,
        status: "skipped",
        detail:
          "WhatsApp is not configured yet. Needs a verified sender number and an approved utility template.",
        attempts: 0,
        at,
      });
      continue;
    }
    const result = await withRetry(() => sendQuoteWhatsApp(quote, recipient));
    whatsappLog.push({ recipient: recipient.value, name: recipient.name, ...result, at });
  }

  /* -- Buyer's own copy, clearly a request not a confirmation (§7.2 step 7) */
  if (canEmail) {
    const result = await withRetry(() =>
      sendQuoteEmail(quote, { id: "buyer", name: quote.contact_name, channel: "email", value: quote.email }, true),
    );
    emailLog.push({
      recipient: quote.email,
      name: `${quote.contact_name} (buyer copy)`,
      ...result,
      at,
    });
  } else {
    emailLog.push({
      recipient: quote.email,
      name: `${quote.contact_name} (buyer copy)`,
      status: "skipped",
      detail: "Email is not configured yet.",
      attempts: 0,
      at,
    });
  }

  recordNotification(quote.id, "email", emailLog);
  recordNotification(quote.id, "whatsapp", whatsappLog);

  return { email: emailLog, whatsapp: whatsappLog };
}

/**
 * Re-send everything for one request — the "Resend notifications" button (§7.3).
 * Overwrites the logs, because what the owner cares about is whether it has
 * landed now, not the history of attempts.
 */
export async function resendQuoteNotifications(
  quote: QuoteRequestWithLines,
): Promise<DispatchResult> {
  return dispatchQuoteNotifications(quote);
}
