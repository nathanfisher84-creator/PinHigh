"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  clearSession,
  setSession,
  verifyCredentials,
  adminConfigured,
} from "@/lib/auth";
import { audit, run, setSetting, uid, now, getSetting } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import {
  getQuoteById,
  updateQuoteFields,
  updateQuoteStatus,
} from "@/lib/repo/quotes";
import { resendQuoteNotifications } from "@/lib/notify";
import { sendWhatsAppTest } from "@/lib/notify/whatsapp";
import { rollbackImport } from "@/lib/import/commit";
import type { QuoteStatus } from "@/lib/domain/types";

/* -------------------------------------------------------------------------
   Auth
   ---------------------------------------------------------------------- */

export async function login(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!adminConfigured()) {
    return {
      error:
        "No admin account is configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment, then restart.",
    };
  }

  // Rate limit the login itself (§2). Brute-forcing a single shared password is
  // the obvious attack against this seam.
  const headerList = await headers();
  const limit = await rateLimit(clientIp(headerList), 10, "login");
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in ${Math.ceil(limit.resetSeconds / 60)} minutes.`,
    };
  }

  const session = verifyCredentials(email, password);
  if (!session) {
    audit("admin.login.failed", email);
    // One message for both cases — telling an attacker which half was wrong is
    // free information.
    return { error: "That email and password don't match." };
  }

  await setSession(session);
  audit("admin.login", session.email);
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  await clearSession();
  redirect("/admin/login");
}

/* -------------------------------------------------------------------------
   Quote requests (§9)
   ---------------------------------------------------------------------- */

export async function setQuoteStatus(id: string, status: QuoteStatus) {
  updateQuoteStatus(id, status);
  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function saveQuoteDetails(id: string, formData: FormData) {
  const rawValue = String(formData.get("quoted_value") ?? "").trim();
  const parsed = rawValue === "" ? null : Number(rawValue.replace(/[^\d.]/g, ""));

  updateQuoteFields(id, {
    quoted_value: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    internal_notes: String(formData.get("internal_notes") ?? "") || null,
  });

  revalidatePath(`/admin/quotes/${id}`);
}

export async function resendNotifications(id: string): Promise<{ message: string }> {
  const quote = getQuoteById(id);
  if (!quote) return { message: "That request no longer exists." };

  const result = await resendQuoteNotifications(quote);
  const sent = [...result.email, ...result.whatsapp].filter((r) => r.status === "sent").length;
  const failed = [...result.email, ...result.whatsapp].filter((r) => r.status === "failed").length;
  const skipped = [...result.email, ...result.whatsapp].filter((r) => r.status === "skipped").length;

  revalidatePath(`/admin/quotes/${id}`);

  if (sent === 0 && skipped > 0 && failed === 0) {
    return {
      message: `Nothing was sent — ${skipped} ${
        skipped === 1 ? "recipient is" : "recipients are"
      } on a channel that isn't connected yet.`,
    };
  }
  return {
    message: `Sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}${
      failed ? `, ${failed} failed` : ""
    }${skipped ? `, ${skipped} skipped` : ""}.`,
  };
}

/* -------------------------------------------------------------------------
   Stock (§4)
   ---------------------------------------------------------------------- */

export async function rollbackStockImport(importId: string): Promise<{ message: string }> {
  try {
    const { restored } = rollbackImport(importId);
    revalidatePath("/admin/stock");
    revalidatePath("/catalogue");
    revalidatePath("/");
    return { message: `Rolled back. ${restored} SKUs restored to how they were.` };
  } catch (err) {
    return { message: err instanceof Error ? err.message : "That rollback failed." };
  }
}

/* -------------------------------------------------------------------------
   Products (§9)
   ---------------------------------------------------------------------- */

export async function saveProduct(id: string, formData: FormData) {
  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const colour = String(formData.get("colour") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const styleName = String(formData.get("style_name") ?? "").trim();

  /*
   * An article imported from an adidas invoice arrives with no name, colour,
   * category or gender. It stops "needing review" the moment it has a name and
   * a colour that are not just the article number echoed back.
   */
  const reviewed =
    styleName.length > 0 &&
    styleName !== String(formData.get("article_number") ?? "") &&
    colour.length > 0;

  run(
    `UPDATE products SET
       style_name = ?, colour = ?, category = ?, gender = ?,
       description = ?, fabric = ?, season = ?, colour_hex = ?,
       price_wholesale = ?, rrp = ?, case_pack = ?, moq = ?,
       is_visible = ?, is_discontinued = ?, sort_order = ?,
       needs_review = ?, updated_at = ?
     WHERE id = ?`,
    styleName,
    colour,
    category,
    gender,
    String(formData.get("description") ?? "") || null,
    String(formData.get("fabric") ?? "") || null,
    String(formData.get("season") ?? "") || null,
    String(formData.get("colour_hex") ?? "") || null,
    num("price_wholesale"),
    num("rrp"),
    num("case_pack"),
    num("moq"),
    formData.get("is_visible") === "on" ? 1 : 0,
    formData.get("is_discontinued") === "on" ? 1 : 0,
    num("sort_order") ?? 0,
    reviewed ? 0 : 1,
    now(),
    id,
  );

  audit("product.update", id);
  revalidatePath("/admin/products");
  revalidatePath("/catalogue");
  revalidatePath("/");
}

export async function setProductVisibility(ids: string[], visible: boolean) {
  if (ids.length === 0) return;
  run(
    `UPDATE products SET is_visible = ?, updated_at = ?
      WHERE id IN (${ids.map(() => "?").join(",")})`,
    visible ? 1 : 0,
    now(),
    ...ids,
  );
  audit("product.visibility", undefined, { ids, visible });
  revalidatePath("/admin/products");
  revalidatePath("/catalogue");
}

/* -------------------------------------------------------------------------
   Recipients (§9)
   ---------------------------------------------------------------------- */

export async function addRecipient(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "email") as "email" | "whatsapp";
  const value = String(formData.get("value") ?? "").trim();

  if (!name || !value) return { error: "Both a name and an address or number are needed." };

  if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return { error: "That doesn't look like an email address." };
  }
  if (channel === "whatsapp" && !/^\+?\d{7,15}$/.test(value.replace(/[\s-]/g, ""))) {
    return { error: "Enter a WhatsApp number in full international format, e.g. +971501234567." };
  }

  run(
    `INSERT INTO notification_recipients (id, name, channel, value, is_active, receives)
     VALUES (?,?,?,?,1,?)`,
    uid(),
    name,
    channel,
    value,
    JSON.stringify(["quote_request"]),
  );

  audit("recipient.add", value, { channel });
  revalidatePath("/admin/recipients");
  return {};
}

export async function toggleRecipient(id: string, active: boolean) {
  run("UPDATE notification_recipients SET is_active = ? WHERE id = ?", active ? 1 : 0, id);
  audit("recipient.toggle", id, { active });
  revalidatePath("/admin/recipients");
}

export async function removeRecipient(id: string) {
  run("DELETE FROM notification_recipients WHERE id = ?", id);
  audit("recipient.remove", id);
  revalidatePath("/admin/recipients");
}

export async function testWhatsApp(value: string): Promise<{ message: string }> {
  try {
    await sendWhatsAppTest(value);
    audit("recipient.test", value);
    return { message: `Test message sent to ${value}. Check the handset.` };
  } catch (err) {
    return {
      message: err instanceof Error ? err.message : "That test message didn't go through.",
    };
  }
}

/* -------------------------------------------------------------------------
   Settings (§9)
   ---------------------------------------------------------------------- */

const EDITABLE_SETTINGS = [
  "announcement",
  "contact_email",
  "contact_phone",
  "contact_whatsapp",
  "branding_min_units",
  "quote_response_hours",
  "show_non_new_stock",
];

export async function saveSettings(formData: FormData) {
  for (const key of EDITABLE_SETTINGS) {
    if (!formData.has(key)) {
      // Unchecked checkboxes are absent from the payload entirely.
      if (key === "show_non_new_stock") setSetting(key, "false");
      continue;
    }
    const raw = formData.get(key);
    const value = raw === "on" ? "true" : String(raw ?? "");
    setSetting(key, value);
  }

  audit("settings.update");
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function getAnnouncement(): Promise<string> {
  return getSetting("announcement");
}
