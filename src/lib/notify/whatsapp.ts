import "server-only";
import type { QuoteRequestWithLines } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import type { Recipient } from "./index";

/**
 * WhatsApp Cloud API (spec §7.3).
 *
 * Setup this depends on, none of which is code:
 *   - A verified Meta Business account.
 *   - A WhatsApp Business Account with a dedicated sender number — not a number
 *     already registered on the consumer app.
 *   - An approved template under the **utility** category, not marketing.
 *     Category sets the rate, and utility is roughly an order of magnitude
 *     cheaper for the same message.
 *   - Each staff recipient opted in to messages from the business number.
 *
 * Until those exist this module is never reached: `dispatchQuoteNotifications`
 * records recipients as `skipped` when the environment is not configured.
 */

const GRAPH_VERSION = "v21.0";

/**
 * Template parameters must not contain newlines, tabs, or more than four
 * consecutive spaces — Meta rejects the message outright if they do, and the
 * rejection is opaque, so the values are scrubbed here rather than debugged
 * later.
 */
function param(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim()
    .slice(0, 1024);
}

/** Digits only, no leading +, which is the format the Cloud API expects. */
function normaliseNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function buildTemplateParameters(quote: QuoteRequestWithLines): string[] {
  return [
    param(quote.reference),
    param(quote.company_name),
    param(quote.total_units),
    param(quote.lines.length),
    param(quote.indicative_value.toFixed(2)),
    // Whether a logo is attached materially changes who picks the request up
    // and how long it takes to price, so it belongs in the notification rather
    // than one click deeper (§7.3).
    param(quote.has_branding ? "yes" : "no"),
    param(quote.required_by ? formatDate(quote.required_by) : "not specified"),
  ];
}

export async function sendQuoteWhatsApp(
  quote: QuoteRequestWithLines,
  recipient: Recipient,
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    throw new Error("WhatsApp is not configured.");
  }

  const parameters = buildTemplateParameters(quote);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normaliseNumber(recipient.value),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: parameters.map((text) => ({ type: "text", text })),
            },
            {
              // URL button to the admin detail page (§7.3).
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: quote.id }],
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp returned ${response.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Send a test message — the owner must be able to verify a number himself,
 * without calling a developer (§9).
 */
export async function sendWhatsAppTest(to: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    throw new Error(
      "WhatsApp isn't connected yet. Add the sender number and template name to the environment first.",
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normaliseNumber(to),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                "PH-Q-TEST-0000",
                "Test message from the admin panel",
                "0",
                "0",
                "0.00",
                "no",
                "not specified",
              ].map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp returned ${response.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * The `wa.me` fallback on the confirmation screen (§7.3).
 * Costs nothing and gives the buyer a sense of control; the server-side push
 * is still the mechanism that matters.
 */
export function waMeLink(salesNumber: string, reference: string, company: string): string {
  const text = `Hi Pin High — I've just sent quote request ${reference} for ${company}.`;
  return `https://wa.me/${normaliseNumber(salesNumber)}?text=${encodeURIComponent(text)}`;
}
