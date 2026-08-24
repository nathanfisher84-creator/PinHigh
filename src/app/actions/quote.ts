"use server";

import { headers } from "next/headers";
import { quoteRequestSchema } from "@/lib/validation/quote";
import { collectLogoFiles, persistQuoteRequest, storeLogoFile } from "@/lib/quotes/submit";
import { clientIp, rateLimit, verifyTurnstile } from "@/lib/ratelimit";
import { run, uid, now } from "@/lib/db";

/**
 * Quote submission (spec §7.2).
 *
 * The rule that shapes this whole action: **do not block on stock**. A shortfall
 * is the salesperson's conversation, not the form's. So availability is
 * re-checked, movement is flagged onto the line for the sales team, and the
 * buyer is never told their request is invalid.
 *
 * Stock is not decremented here. That happens only when staff approve the
 * request in admin.
 */

export interface SubmitResult {
  ok: boolean;
  reference?: string;
  /** Field-level errors, keyed by field name, for inline display. */
  errors?: Record<string, string>;
  message?: string;
}

export async function submitQuoteRequest(formData: FormData): Promise<SubmitResult> {
  const headerList = await headers();
  const ip = clientIp(headerList);

  /* -- Abuse controls (§7.2) -------------------------------------------- */

  // Honeypot. Named so browsers will not autofill it (a field called
  // `company_website` was being filled by password managers, which returned
  // a fake success and never wrote the request).
  const honeypot = String(formData.get("fax_number_hp") ?? formData.get("company_website") ?? "");
  if (honeypot.trim().length > 0) {
    return { ok: true, reference: "PH-Q-0000-0000" };
  }

  const limit = await rateLimit(ip, 5, "quote");
  if (!limit.allowed) {
    return {
      ok: false,
      message: `That's five requests in an hour from this connection. Try again in ${Math.ceil(
        limit.resetSeconds / 60,
      )} minutes, or email us from the contact page.`,
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
    company_website: "",
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
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { ok: false, errors: { lines: "Add at least one size before sending." }, message: "Add at least one size before sending." };
  }

  /* -- Logos (§8) — more than one is allowed ----------------------------- */

  let logoPaths: { storage_path: string; original_name?: string | null }[] = [];
  try {
    for (const file of collectLogoFiles(formData)) {
      const stored = await storeLogoFile(file);
      logoPaths.push({ storage_path: stored.path, original_name: stored.name });
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "That logo file couldn't be saved.",
    };
  }

  /* -- Persist. Notifications must not fail this. ------------------------ */

  const phone = `${input.phone_country} ${input.phone}`.trim();

  try {
    const quote = await persistQuoteRequest({
      company_name: input.company_name,
      trn: input.trn || undefined,
      contact_name: input.contact_name,
      contact_role: input.contact_role || undefined,
      email: input.email,
      phone,
      delivery_emirate: input.delivery_emirate,
      required_by: input.required_by || undefined,
      notes: input.notes || undefined,
      logo_notes: input.logo_notes || undefined,
      lines: input.lines,
      logoPaths,
    });
    return { ok: true, reference: quote.reference };
  } catch (err) {
    console.error("[pinhigh] quote create failed:", err);
    return {
      ok: false,
      message:
        "Something went wrong saving your request. Nothing was sent — please try again, or email us directly.",
    };
  }
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
