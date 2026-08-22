/**
 * Public contact numbers.
 *
 * We do not have a real Dubai phone, WhatsApp, street address, or email to
 * publish. Seed/defaults historically carried placeholders
 * (`+971 4 000 0000`, `+971500000000`) and the footer built `tel:+` from a
 * broken strip. If a value is empty, still a placeholder, or would produce a
 * broken `tel:` / `wa.me` link, hide the row instead of inventing a number.
 */

const PLACEHOLDER_DIGITS = new Set([
  "97140000000", // +971 4 000 0000
  "971500000000", // +971500000000
]);

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

function telLocalPart(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/** True when the value must not be rendered on a public page. */
export function isUnpublishedContactNumber(raw: string | null | undefined): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return true;

  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "tel:+" || compact === "tel:" || compact === "+") {
    return true;
  }

  const digits = digitsOf(value);
  if (digits.length < 8) return true;
  if (PLACEHOLDER_DIGITS.has(digits)) return true;
  // Country code + all-zero remainder, or a number that is only zeros.
  if (/^9710+$/.test(digits) || /^0+$/.test(digits)) return true;

  const local = telLocalPart(value);
  if (!local || local === "+") return true;

  return false;
}

/** The number to show, or null when the public page should hide the row. */
export function publicContactNumber(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (isUnpublishedContactNumber(value)) return null;
  return value;
}

/** `tel:` href, or null when it would be empty / `tel:+`. */
export function telHref(phone: string): string | null {
  const local = telLocalPart(phone);
  if (!local || local === "+") return null;
  return `tel:${local}`;
}
