import "server-only";
import type { QuoteRequestWithLines } from "@/lib/domain/types";
import { formatDate, money, units } from "@/lib/format";
import { quoteLinesCsv } from "./csv";
import type { Recipient } from "./index";
import { getSetting } from "@/lib/db";
import { openSecret } from "@/lib/secrets";

/**
 * Transactional email via Resend (spec §2, §7.3).
 *
 * Email is the system of record: HTML summary plus a CSV of the lines. The
 * copy is written to §7.1's vocabulary — this is a *request*, and the email
 * must never read as a confirmation, because the sales team then has to walk
 * that back with a customer who thinks they have ordered.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Two interchangeable transports behind one message shape:
 *
 *   - Gmail SMTP when GMAIL_USER + GMAIL_APP_PASSWORD are set. Works with
 *     nothing but a Gmail account and an app password — no domain to verify —
 *     which is what gets a small business receiving quotes today. The buyer's
 *     copy arrives from the Gmail address (with the Pin High display name).
 *   - Resend when RESEND_API_KEY + ORDER_FROM_EMAIL are set. The upgrade
 *     path once the domain's DNS is in hand: same emails, sent from
 *     quotes@pinhighuae.com. If both are configured, Resend wins.
 *
 * Swapping is an env-var change; nothing above this file knows or cares.
 */
/**
 * Gmail credentials, owner-set first: the pair entered on the admin settings
 * page (app password sealed at rest) beats the environment pair, because the
 * account belongs to the client and the panel is where they manage it.
 */
async function gmailCreds(): Promise<{ user: string; pass: string } | null> {
  const dbUser = await getSetting("gmail_user");
  if (dbUser) {
    const sealed = await getSetting("gmail_app_password");
    const pass = sealed ? openSecret(sealed) : null;
    if (pass) return { user: dbUser, pass };
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD };
  }
  return null;
}

export async function emailConfigured(): Promise<boolean> {
  if (process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL) return true;
  return (await gmailCreds()) !== null;
}

/** What the settings page reports, without ever surfacing a secret. */
export async function emailTransportStatus(): Promise<
  { transport: "resend" | "gmail-admin" | "gmail-env" | "none"; sender: string | null }
> {
  if (process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL) {
    return { transport: "resend", sender: process.env.ORDER_FROM_EMAIL };
  }
  const dbUser = await getSetting("gmail_user");
  if (dbUser) {
    const sealed = await getSetting("gmail_app_password");
    if (sealed && openSecret(sealed)) return { transport: "gmail-admin", sender: dbUser };
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return { transport: "gmail-env", sender: process.env.GMAIL_USER };
  }
  return { transport: "none", sender: null };
}

interface OutboundEmail {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

async function deliver(msg: OutboundEmail): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.ORDER_FROM_EMAIL;

  if (resendKey && resendFrom) {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        html: msg.html,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 300)}`);
    }
    return;
  }

  const gmail = await gmailCreds();
  if (gmail) {
    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmail.user, pass: gmail.pass },
    });
    await transporter.sendMail({
      from: { name: "Pin High UAE", address: gmail.user },
      to: msg.to,
      replyTo: msg.replyTo,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.attachments,
    });
    return;
  }

  throw new Error("Email is not configured.");
}

/** A minimal proof-of-life email, for the settings page's test button. */
export async function sendTestEmail(to: string): Promise<void> {
  await deliver({
    to,
    subject: "Pin High — test email",
    html:
      "<p>This is a test from your Pin High site. If you are reading it, " +
      "quote notifications will reach this address.</p>",
  });
}

export async function sendQuoteEmail(
  quote: QuoteRequestWithLines,
  recipient: Recipient,
  isBuyerCopy = false,
): Promise<void> {
  await deliver({
    to: recipient.value,
    replyTo: isBuyerCopy ? undefined : quote.email,
    subject: isBuyerCopy
      ? `We have your quote request — ${quote.reference}`
      : `Quote request ${quote.reference} — ${quote.company_name} (${quote.total_units} units)`,
    html: renderQuoteEmail(quote, isBuyerCopy),
    // The CSV carries indicative unit prices for the sales team. The buyer
    // copy gets no attachment at all: the public site shows no prices, and
    // a figure arriving as an attachment would undo that as surely as one
    // on a page.
    attachments: isBuyerCopy
      ? undefined
      : [
          {
            filename: `${quote.reference}-lines.csv`,
            content: Buffer.from(quoteLinesCsv(quote), "utf8"),
          },
        ],
  });
}

/* -------------------------------------------------------------------------
   Template
   ---------------------------------------------------------------------- */

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQuoteEmail(quote: QuoteRequestWithLines, isBuyerCopy: boolean): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pinhighuae.com";
  const responseHours = process.env.QUOTE_RESPONSE_HOURS ?? "24";

  /*
   * The sales team's copy carries the indicative figures they need to price
   * the job. The buyer's copy does not: no price appears anywhere on the
   * public site, and a figure arriving by email would undo that.
   */
  const showPrices = !isBuyerCopy;

  const rows = quote.lines
    .map(
      (l) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4;font-family:monospace">${esc(l.article_number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4">${esc(l.brand)} ${esc(l.style_name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4">${esc(l.colour)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4;font-family:monospace">${esc(l.size)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4;font-family:monospace;text-align:right">${l.quantity}</td>
      ${
        showPrices
          ? `<td style="padding:6px 10px;border-bottom:1px solid #D8D2C4;font-family:monospace;text-align:right">${
              l.unit_price === null ? "—" : l.unit_price.toFixed(2)
            }</td>`
          : ""
      }
      <td style="padding:6px 10px;border-bottom:1px solid #D8D2C4">${
        l.branding_placements?.length ? esc(l.branding_placements.join(", ")) : "—"
      }</td>
    </tr>`,
    )
    .join("");

  const stockFlags = quote.lines.filter((l) => l.stock_flag);

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F7F6F3;color:#14181A;font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;line-height:1.6">
  <div style="max-width:760px;margin:0 auto;padding:28px 20px">

    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#5A6165">
      Pin High UAE
    </p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:600">
      ${isBuyerCopy ? "We have your quote request" : "New quote request"}
    </h1>
    <p style="margin:0 0 20px;font-family:monospace;font-size:16px">${esc(quote.reference)}</p>

    ${
      isBuyerCopy
        ? `<p style="margin:0 0 20px">Thank you — this is a <strong>request for a quote</strong>, not an order.
             Nothing has been charged and nothing is reserved. Our team will price it,
             including branding and delivery, and come back to you within
             ${esc(responseHours)} hours.</p>`
        : `<p style="margin:0 0 20px"><strong>${esc(quote.company_name)}</strong> has requested a quote for
             ${quote.total_units} units across ${quote.lines.length} lines.</p>`
    }

    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr><td style="padding:4px 0;color:#5A6165;width:150px">Company</td><td>${esc(quote.company_name)}</td></tr>
      <tr><td style="padding:4px 0;color:#5A6165">Contact</td><td>${esc(quote.contact_name)}${
        quote.contact_role ? `, ${esc(quote.contact_role)}` : ""
      }</td></tr>
      <tr><td style="padding:4px 0;color:#5A6165">Email</td><td>${esc(quote.email)}</td></tr>
      <tr><td style="padding:4px 0;color:#5A6165">Phone</td><td>${esc(quote.phone)}</td></tr>
      ${quote.trn ? `<tr><td style="padding:4px 0;color:#5A6165">TRN</td><td style="font-family:monospace">${esc(quote.trn)}</td></tr>` : ""}
      <tr><td style="padding:4px 0;color:#5A6165">Deliver to</td><td>${esc(quote.delivery_emirate)}</td></tr>
      <tr><td style="padding:4px 0;color:#5A6165">Needed by</td><td>${
        quote.required_by ? esc(formatDate(quote.required_by)) : "Not specified"
      }</td></tr>
      <tr><td style="padding:4px 0;color:#5A6165">Branding</td><td>${
        quote.has_branding ? "<strong>Yes — logo supplied</strong>" : "No"
      }</td></tr>
    </table>

    ${
      quote.notes
        ? `<div style="border-left:3px solid #1F4D3A;padding:8px 14px;margin:0 0 24px;background:#EDF2EF">
             <p style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#5A6165">Notes from the buyer</p>
             <p style="margin:4px 0 0;white-space:pre-wrap">${esc(quote.notes)}</p>
           </div>`
        : ""
    }

    ${
      stockFlags.length && !isBuyerCopy
        ? `<div style="border:1px solid #C9483A;padding:10px 14px;margin:0 0 24px;background:#FBEEEC">
             <p style="margin:0;font-weight:600;color:#B03A2E">Availability moved on ${stockFlags.length} ${
               stockFlags.length === 1 ? "line" : "lines"
             }</p>
             <p style="margin:4px 0 0;font-size:13px">${stockFlags
               .map((l) => `${esc(l.article_number)} ${esc(l.size)} — ${esc(l.stock_flag)}`)
               .join("<br>")}</p>
           </div>`
        : ""
    }

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;border-bottom:2px solid #14181A">
          <th style="padding:6px 10px">Article</th>
          <th style="padding:6px 10px">Item</th>
          <th style="padding:6px 10px">Colour</th>
          <th style="padding:6px 10px">Size</th>
          <th style="padding:6px 10px;text-align:right">Qty</th>
          ${showPrices ? '<th style="padding:6px 10px;text-align:right">Unit</th>' : ""}
          <th style="padding:6px 10px">Branding</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #14181A;font-weight:600">
          <td colspan="4" style="padding:8px 10px">Total</td>
          <td style="padding:8px 10px;font-family:monospace;text-align:right">${quote.total_units}</td>
          ${
            showPrices
              ? `<td style="padding:8px 10px;font-family:monospace;text-align:right">${money(
                  quote.indicative_value,
                )}</td>`
              : ""
          }
          <td></td>
        </tr>
      </tfoot>
    </table>

    <p style="margin:16px 0 0;font-size:12px;color:#5A6165">
      ${
        showPrices
          ? "Indicative — excludes 5% VAT, branding and delivery. Nothing is reserved and no price is final until confirmed by our team."
          : "We price each request on its own — quantity, branding and delivery together. Nothing is reserved and nothing has been charged."
      }
    </p>

    ${
      isBuyerCopy
        ? ""
        : `<p style="margin:24px 0 0">
             <a href="${esc(siteUrl)}/admin/quotes/${esc(quote.id)}"
                style="display:inline-block;background:#1F4D3A;color:#F7F6F3;padding:11px 20px;text-decoration:none">
               Open in the admin panel
             </a>
           </p>`
    }

    <p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #D8D2C4;font-size:12px;color:#5A6165">
      Pin High UAE · ${esc(units(quote.total_units))} · ${esc(quote.reference)}
    </p>
  </div>
</body></html>`;
}
