"use server";

import { headers } from "next/headers";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { putArtwork } from "@/lib/images/storage";
import { quoteRequestSchema } from "@/lib/validation/quote";
import { getVariantsBySku } from "@/lib/repo/catalogue";
import { createQuoteRequest } from "@/lib/repo/quotes";
import { dispatchQuoteNotifications } from "@/lib/notify";
import { clientIp, rateLimit, verifyTurnstile } from "@/lib/ratelimit";
import { run, uid, now } from "@/lib/db";

/**
 * Quote submission (spec §7.2).
 *
 * The rule that shapes this whole action: **do not block on stock**. A shortfall
 * is the salesperson's conversation, not the form's. So availability is
 * re-checked, movement is flagged onto the line for the sales team, and the
 * buyer is never told their request is invalid.
 */

export interface SubmitResult {
  ok: boolean;
  reference?: string;
  /** Field-level errors, keyed by field name, for inline display. */
  errors?: Record<string, string>;
  message?: string;
}

/** Vector strongly preferred, raster accepted with a warning (§8). */
const LOGO_TYPES = new Map<string, string>([
  ["application/postscript", "ai"],
  ["application/illustrator", "ai"],
  ["application/pdf", "pdf"],
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/x-eps", "eps"],
  ["application/eps", "eps"],
]);

const MAX_LOGO_BYTES = 25 * 1024 * 1024;

async function storeLogo(file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("That logo file is over 25 MB. Send it to us by email instead.");
  }

  const extFromName = path.extname(file.name).replace(".", "").toLowerCase();
  const ext = LOGO_TYPES.get(file.type) ?? (extFromName || "bin");

  // Customers' trademarks. Stored privately with a random name, served only
  // through an admin-authenticated route — never from a public bucket or
  // directory (§8). putArtwork lands in Supabase's private bucket when
  // configured, local disk otherwise.
  const stored = `${randomUUID()}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
  await putArtwork(stored, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  return stored;
}

export async function submitQuoteRequest(formData: FormData): Promise<SubmitResult> {
  const headerList = await headers();
  const ip = clientIp(headerList);

  /* -- Abuse controls (§7.2) -------------------------------------------- */

  // Honeypot. A real buyer never sees this field, so anything in it is a bot.
  // Return success so the bot has nothing to learn from the response.
  const honeypot = String(formData.get("company_website") ?? "");
  if (honeypot.trim().length > 0) {
    return { ok: true, reference: "PH-Q-0000-0000" };
  }

  const limit = await rateLimit(ip, 5, "quote");
  if (!limit.allowed) {
    return {
      ok: false,
      message: `That's five requests in an hour from this connection. Try again in ${Math.ceil(
        limit.resetSeconds / 60,
      )} minutes, or call us on the number in the footer.`,
    };
  }

  const turnstileOk = await verifyTurnstile(
    String(formData.get("turnstile_token") ?? "") || undefined,
    ip,
  );
  if (!turnstileOk) {
    return {
      ok: false,
      message: "We couldn't verify that you're human. Refresh the page and try again.",
    };
  }

  /* -- Validation. The client is assumed hostile (§7.2 step 2). ---------- */

  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, message: "Your order didn't come through. Refresh and try again." };
  }

  const parsed = quoteRequestSchema.safeParse({
    company_name: formData.get("company_name") ?? "",
    trn: formData.get("trn") ?? "",
    contact_name: formData.get("contact_name") ?? "",
    contact_role: formData.get("contact_role") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    phone_country: formData.get("phone_country") ?? "+971",
    delivery_emirate: formData.get("delivery_emirate") ?? "",
    required_by: formData.get("required_by") ?? "",
    notes: formData.get("notes") ?? "",
    logo_notes: formData.get("logo_notes") ?? "",
    lines,
    company_website: honeypot,
    turnstile_token: formData.get("turnstile_token") ?? "",
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const input = parsed.data;

  /* -- Logo (§8) --------------------------------------------------------- */

  let logoPath: string | null = null;
  try {
    const file = formData.get("logo");
    if (file instanceof File) logoPath = await storeLogo(file);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "That logo file couldn't be saved.",
    };
  }

  /* -- Re-price and re-check stock server-side (§7.2 step 3) ------------- */

  const live = await getVariantsBySku(input.lines.map((l) => l.sku));

  const resolved = input.lines.map((line) => {
    const variant = live.get(line.sku);

    // Price always comes from the server. A price posted by the client is a
    // suggestion, not a fact.
    if (!variant) {
      return {
        sku: line.sku,
        article_number: line.article_number,
        brand: "—",
        style_name: "Item no longer in the catalogue",
        colour: "—",
        size: line.size,
        quantity: line.quantity,
        unit_price: null,
        branding_placements: line.branding?.placements ?? null,
        stock_flag: "This article is no longer listed — check with the buyer.",
      };
    }

    let stockFlag: string | null = null;
    if (variant.quantity <= 0) {
      stockFlag = `Sold out since the buyer added it (they asked for ${line.quantity}).`;
    } else if (variant.quantity < line.quantity) {
      stockFlag = `Only ${variant.quantity} left — the buyer asked for ${line.quantity}.`;
    } else if (!variant.is_visible) {
      stockFlag = "This article has been hidden in the admin panel since the buyer added it.";
    }

    return {
      sku: line.sku,
      article_number: variant.article_number,
      brand: variant.brand,
      style_name: variant.style_name,
      colour: variant.colour,
      size: variant.size,
      quantity: line.quantity, // what the buyer asked for, not what is left
      unit_price: variant.price_wholesale,
      branding_placements: line.branding?.placements?.length
        ? line.branding.placements
        : null,
      stock_flag: stockFlag,
    };
  });

  /* -- Create (§7.2 step 4) ---------------------------------------------- */

  const phone = `${input.phone_country} ${input.phone}`.trim();

  let quote;
  try {
    quote = (await createQuoteRequest({
      company_name: input.company_name,
      trn: input.trn || null,
      contact_name: input.contact_name,
      contact_role: input.contact_role || null,
      email: input.email,
      phone,
      delivery_emirate: input.delivery_emirate,
      required_by: input.required_by || null,
      notes: input.notes || null,
      logo_path: logoPath,
      logo_notes: input.logo_notes || null,
      lines: resolved,
    }));
  } catch (err) {
    console.error("[pinhigh] quote create failed:", err);
    return {
      ok: false,
      message:
        "Something went wrong saving your request. Nothing was sent — please try again, or email us directly.",
    };
  }

  /* -- Notify (§7.2 step 5) ---------------------------------------------- */
  // The request is already committed. A notification failure is logged and
  // surfaced in the admin panel, and must never fail the request.
  try {
    await dispatchQuoteNotifications(quote);
  } catch (err) {
    console.error("[pinhigh] notification dispatch failed:", err);
  }

  return { ok: true, reference: quote.reference };
}

/* -------------------------------------------------------------------------
   Back-in-stock capture (§4.3)
   ---------------------------------------------------------------------- */

export async function captureStockAlert(
  articleNumber: string,
  email: string,
): Promise<{ ok: boolean; message: string }> {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }

  const headerList = await headers();
  const limit = await rateLimit(clientIp(headerList), 10, "alert");
  if (!limit.allowed) {
    return { ok: false, message: "Too many requests just now. Try again shortly." };
  }

  try {
    await run(
      `INSERT INTO stock_alerts (id, article_number, email, created_at)
       VALUES (?,?,?,?)
       ON CONFLICT(article_number, email) DO NOTHING`,
      uid(),
      articleNumber,
      address,
      now(),
    );
  } catch (err) {
    console.error("[pinhigh] stock alert failed:", err);
    return { ok: false, message: "We couldn't save that. Try again in a moment." };
  }

  return { ok: true, message: "We'll email you when this article is back in stock." };
}
