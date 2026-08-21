import { z } from "zod";
import { EMIRATES } from "@/lib/domain/types";

/**
 * Quote request validation (spec §7.2), shared between client and server.
 *
 * The server re-validates with the same schema and assumes the client is
 * hostile. What this schema deliberately does *not* do is block a lead:
 * TRN is optional because many corporate buyers won't have it to hand, and
 * nothing here rejects a request for being small, awkward or short on stock.
 * A form that refuses a corporate enquiry has thrown away the enquiry.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const brandingSchema = z.object({
  placements: z.array(z.string().trim().min(1).max(60)).max(8),
  notes: trimmed(500).optional(),
});

export const quoteLineSchema = z.object({
  sku: trimmed(80).min(1),
  article_number: trimmed(60).min(1),
  size: trimmed(20).min(1),
  quantity: z.number().int().min(1).max(100_000),
  branding: brandingSchema.optional(),
});

export const EMIRATE_VALUES = EMIRATES as readonly string[];

export const quoteRequestSchema = z.object({
  company_name: trimmed(160).min(2, "Enter the company name."),

  // Collected but not validated against the FTA register (§15.9). UAE TRNs are
  // 15 digits; anything else is accepted and passed to the sales team as typed,
  // because a buyer half-remembering it is still a buyer.
  trn: trimmed(30).optional().or(z.literal("")),

  contact_name: trimmed(120).min(2, "Enter a contact name."),
  contact_role: trimmed(120).optional().or(z.literal("")),

  email: trimmed(200).email("Enter an email address we can reply to."),

  phone: trimmed(40).min(6, "Enter a phone number we can reach you on."),
  phone_country: trimmed(8).default("+971"),

  delivery_emirate: z.string().refine((v) => EMIRATE_VALUES.includes(v), {
    message: "Choose where this is going.",
  }),

  required_by: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
    .optional()
    .or(z.literal("")),

  notes: trimmed(2000).optional().or(z.literal("")),

  logo_notes: trimmed(1000).optional().or(z.literal("")),

  lines: z.array(quoteLineSchema).min(1, "Add at least one size before sending."),

  // Anti-spam (§7.2). The honeypot must stay empty; a real buyer never sees it.
  company_website: z.string().max(0).optional().or(z.literal("")),
  turnstile_token: z.string().optional(),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

/* -------------------------------------------------------------------------
   Field-level helpers for inline validation
   ---------------------------------------------------------------------- */

/** UAE TRNs are 15 digits. Used for a hint, never to block (§15.9). */
export function trnLooksComplete(trn: string): boolean {
  const digits = trn.replace(/\D/g, "");
  return digits.length === 15;
}

export function trnHint(trn: string): string | null {
  const value = trn.trim();
  if (!value) return null;
  if (trnLooksComplete(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return `A UAE TRN is 15 digits — this has ${digits.length}. We'll take it as it is and check on our side.`;
}

/** Country codes a Dubai distributor actually sees on corporate enquiries. */
export const PHONE_COUNTRIES = [
  { code: "+971", label: "UAE", flag: "AE" },
  { code: "+966", label: "Saudi Arabia", flag: "SA" },
  { code: "+974", label: "Qatar", flag: "QA" },
  { code: "+973", label: "Bahrain", flag: "BH" },
  { code: "+968", label: "Oman", flag: "OM" },
  { code: "+965", label: "Kuwait", flag: "KW" },
  { code: "+44", label: "United Kingdom", flag: "GB" },
  { code: "+1", label: "United States", flag: "US" },
  { code: "+91", label: "India", flag: "IN" },
  { code: "+61", label: "Australia", flag: "AU" },
] as const;

/** A quote reference: PH-Q-{year}-{4 digits} (§7.2 step 4). */
export function formatReference(year: number, sequence: number): string {
  return `PH-Q-${year}-${String(sequence).padStart(4, "0")}`;
}

export const REFERENCE_PATTERN = /^PH-Q-\d{4}-\d{4}$/;
