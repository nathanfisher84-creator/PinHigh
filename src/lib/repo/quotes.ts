import "server-only";
import { all, audit, get, now, run, transaction, uid } from "@/lib/db";
import { formatReference } from "@/lib/validation/quote";
import type {
  NotificationLog,
  QuoteLine,
  QuoteLogo,
  QuoteRequest,
  QuoteRequestWithLines,
  QuoteStatus,
} from "@/lib/domain/types";

/* -------------------------------------------------------------------------
   Row mapping
   ---------------------------------------------------------------------- */

type QuoteRow = Omit<
  QuoteRequest,
  "has_branding" | "stock_applied" | "notified_email" | "notified_whatsapp"
> & {
  has_branding: number;
  stock_applied: number;
  notified_email: string;
  notified_whatsapp: string;
};

function parseLog(raw: string): NotificationLog {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toQuote(r: QuoteRow): QuoteRequest {
  return {
    ...r,
    has_branding: !!r.has_branding,
    stock_applied: !!r.stock_applied,
    notified_email: parseLog(r.notified_email),
    notified_whatsapp: parseLog(r.notified_whatsapp),
  };
}

type LineRow = Omit<QuoteLine, "branding_placements"> & { branding_placements: string | null };

function toLine(r: LineRow): QuoteLine {
  let placements: string[] | null = null;
  if (r.branding_placements) {
    try {
      const parsed = JSON.parse(r.branding_placements);
      placements = Array.isArray(parsed) ? parsed : null;
    } catch {
      placements = null;
    }
  }
  return { ...r, branding_placements: placements };
}

/* -------------------------------------------------------------------------
   Reference allocation
   ---------------------------------------------------------------------- */

/**
 * Allocate the next reference: PH-Q-{year}-{4 digits} (§7.2 step 4).
 *
 * Derived from the highest existing reference for the year rather than a
 * counter, so it stays correct if rows are imported or the sequence is ever
 * reset. Called inside the same transaction as the insert, and the UNIQUE
 * constraint on `reference` is the real guarantee against a collision.
 */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PH-Q-${year}-`;
  const row = await get<{ reference: string }>(
    `SELECT reference FROM quote_requests
      WHERE reference LIKE ? ORDER BY reference DESC LIMIT 1`,
    `${prefix}%`,
  );
  const last = row ? Number(row.reference.slice(prefix.length)) : 0;
  return formatReference(year, (Number.isFinite(last) ? last : 0) + 1);
}

/* -------------------------------------------------------------------------
   Create
   ---------------------------------------------------------------------- */

export interface CreateQuoteInput {
  company_name: string;
  trn: string | null;
  contact_name: string;
  contact_role: string | null;
  email: string;
  phone: string;
  delivery_emirate: string;
  required_by: string | null;
  notes: string | null;
  logo_path: string | null;
  logo_notes: string | null;
  /** Extra logo files after the first (which is stored on logo_path). */
  logos?: { storage_path: string; original_name?: string | null }[];
  lines: {
    sku: string;
    article_number: string;
    brand: string;
    style_name: string;
    colour: string;
    size: string;
    quantity: number;
    unit_price: number | null;
    rrp: number | null;
    branding_placements: string[] | null;
    stock_flag: string | null;
  }[];
}

export async function createQuoteRequest(input: CreateQuoteInput): Promise<QuoteRequestWithLines> {
  const id = uid();
  const timestamp = now();

  const totalUnits = input.lines.reduce((n, l) => n + l.quantity, 0);
  const indicativeValue =
    Math.round(
      input.lines.reduce((n, l) => n + (l.unit_price ?? 0) * l.quantity, 0) * 100,
    ) / 100;
  const hasBranding = input.lines.some((l) => (l.branding_placements?.length ?? 0) > 0);

  let reference = "";

  await transaction(async () => {
    reference = await nextReference();

    await run(
      `INSERT INTO quote_requests (
         id, reference, company_name, trn, contact_name, contact_role, email, phone,
         delivery_emirate, required_by, notes, total_units, indicative_value,
         has_branding, logo_path, logo_notes, status, stock_applied, quoted_value, internal_notes,
         notified_email, notified_whatsapp, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      reference,
      input.company_name,
      input.trn,
      input.contact_name,
      input.contact_role,
      input.email,
      input.phone,
      input.delivery_emirate,
      input.required_by,
      input.notes,
      totalUnits,
      indicativeValue,
      hasBranding ? 1 : 0,
      input.logo_path,
      input.logo_notes,
      "new",
      0,
      null,
      null,
      "[]",
      "[]",
      timestamp,
      timestamp,
    );

    for (const [i, line] of input.lines.entries()) {
      await run(
        `INSERT INTO quote_lines (
           id, quote_request_id, sku, article_number, brand, style_name, colour, size,
           quantity, unit_price, line_total, rrp, branding_placements, stock_flag, sort_order
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid(),
        id,
        line.sku,
        line.article_number,
        line.brand,
        line.style_name,
        line.colour,
        line.size,
        line.quantity,
        line.unit_price,
        line.unit_price === null ? null : Math.round(line.unit_price * line.quantity * 100) / 100,
        line.rrp,
        line.branding_placements ? JSON.stringify(line.branding_placements) : null,
        line.stock_flag,
        i,
      );
    }

    const extraLogos = input.logos ?? [];
    for (const [i, logo] of extraLogos.entries()) {
      await run(
        `INSERT INTO quote_logos (id, quote_request_id, storage_path, original_name, sort_order)
         VALUES (?,?,?,?,?)`,
        uid(),
        id,
        logo.storage_path,
        logo.original_name ?? null,
        i,
      );
    }
    if (input.logo_path) {
      const already = extraLogos.some((l) => l.storage_path === input.logo_path);
      if (!already) {
        await run(
          `INSERT INTO quote_logos (id, quote_request_id, storage_path, original_name, sort_order)
           VALUES (?,?,?,?,?)`,
          uid(),
          id,
          input.logo_path,
          null,
          extraLogos.length,
        );
      }
    }
  });

  await audit("quote.create", reference, { units: totalUnits, lines: input.lines.length });

  return (await getQuoteByReference(reference))!;
}

/* -------------------------------------------------------------------------
   Read
   ---------------------------------------------------------------------- */

export async function getQuoteByReference(reference: string): Promise<QuoteRequestWithLines | null> {
  const row = await get<QuoteRow>("SELECT * FROM quote_requests WHERE reference = ?", reference);
  if (!row) return null;
  return withLines(toQuote(row));
}

export async function getQuoteById(id: string): Promise<QuoteRequestWithLines | null> {
  const row = await get<QuoteRow>("SELECT * FROM quote_requests WHERE id = ?", id);
  if (!row) return null;
  return withLines(toQuote(row));
}

async function withLines(quote: QuoteRequest): Promise<QuoteRequestWithLines> {
  const lines = (
    await all<LineRow>(
      "SELECT * FROM quote_lines WHERE quote_request_id = ? ORDER BY sort_order ASC",
      quote.id,
    )
  ).map(toLine);
  const logos = await listQuoteLogos(quote.id, quote.logo_path);
  return { ...quote, lines, logos };
}

export async function listQuoteLogos(
  quoteId: string,
  fallbackPath: string | null,
): Promise<QuoteLogo[]> {
  const rows = await all<QuoteLogo>(
    `SELECT id, storage_path, original_name, sort_order FROM quote_logos
      WHERE quote_request_id = ? ORDER BY sort_order ASC`,
    quoteId,
  );
  if (rows.length > 0) return rows;
  if (!fallbackPath) return [];
  return [
    {
      id: "legacy",
      storage_path: fallbackPath,
      original_name: null,
      sort_order: 0,
    },
  ];
}

export interface QuoteListFilters {
  status?: QuoteStatus[];
  branded?: boolean;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export async function listQuotes(filters: QuoteListFilters = {}): Promise<QuoteRequest[]> {
  const clauses: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.status?.length) {
    clauses.push(`status IN (${filters.status.map(() => "?").join(",")})`);
    params.push(...filters.status);
  }
  if (filters.branded !== undefined) {
    clauses.push("has_branding = ?");
    params.push(filters.branded ? 1 : 0);
  }
  if (filters.from) {
    clauses.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push("created_at <= ?");
    params.push(filters.to);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      "(LOWER(reference) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(contact_name) LIKE ? OR LOWER(email) LIKE ?)",
    );
    params.push(q, q, q, q);
  }

  return (await all<QuoteRow>(
    `SELECT * FROM quote_requests WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC LIMIT ?`,
    ...params,
    filters.limit ?? 200,
  )).map(toQuote);
}

/* -------------------------------------------------------------------------
   Update
   ---------------------------------------------------------------------- */

/** Statuses that mean the goods are leaving the warehouse. */
export function statusTakesStock(status: QuoteStatus): boolean {
  return status === "approved" || status === "won";
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  await transaction(async () => {
    const row = await get<QuoteRow>("SELECT * FROM quote_requests WHERE id = ?", id);
    if (!row) return;
    const quote = await withLines(toQuote(row));
    const takes = statusTakesStock(status);

    if (takes && !quote.stock_applied) {
      await decrementQuoteStock(quote);
      await run(
        "UPDATE quote_requests SET status = ?, stock_applied = 1, updated_at = ? WHERE id = ?",
        status,
        now(),
        id,
      );
    } else if (!takes && quote.stock_applied) {
      await restockQuote(quote);
      await run(
        "UPDATE quote_requests SET status = ?, stock_applied = 0, updated_at = ? WHERE id = ?",
        status,
        now(),
        id,
      );
    } else {
      await run(
        "UPDATE quote_requests SET status = ?, updated_at = ? WHERE id = ?",
        status,
        now(),
        id,
      );
    }
  });
  await audit("quote.status", id, { status });
}

async function decrementQuoteStock(quote: QuoteRequestWithLines) {
  const timestamp = now();
  for (const line of quote.lines) {
    const variant = await get<{ id: string; sku: string; size: string; quantity: number }>(
      "SELECT id, sku, size, quantity FROM variants WHERE sku = ?",
      line.sku,
    );
    if (!variant) continue;
    const after = Math.max(0, variant.quantity - line.quantity);
    if (after === variant.quantity) continue;
    await run("UPDATE variants SET quantity = ?, updated_at = ? WHERE id = ?", after, timestamp, variant.id);
    await run(
      `INSERT INTO stock_adjustments (
         id, sku, article_number, size, quantity_before, quantity_after,
         delta, reason, note, actor, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      uid(),
      variant.sku,
      line.article_number,
      variant.size,
      variant.quantity,
      after,
      after - variant.quantity,
      "sale",
      `Quote ${quote.reference} approved`,
      "admin",
      timestamp,
    );
  }
}

async function restockQuote(quote: QuoteRequestWithLines) {
  const timestamp = now();
  for (const line of quote.lines) {
    const variant = await get<{ id: string; sku: string; size: string; quantity: number }>(
      "SELECT id, sku, size, quantity FROM variants WHERE sku = ?",
      line.sku,
    );
    if (!variant) continue;
    const after = variant.quantity + line.quantity;
    await run("UPDATE variants SET quantity = ?, updated_at = ? WHERE id = ?", after, timestamp, variant.id);
    await run(
      `INSERT INTO stock_adjustments (
         id, sku, article_number, size, quantity_before, quantity_after,
         delta, reason, note, actor, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      uid(),
      variant.sku,
      line.article_number,
      variant.size,
      variant.quantity,
      after,
      line.quantity,
      "return",
      `Quote ${quote.reference} no longer approved`,
      "admin",
      timestamp,
    );
  }
}

export async function replaceQuoteLines(
  id: string,
  lines: CreateQuoteInput["lines"],
  fields: { notes?: string | null; logo_notes?: string | null },
): Promise<void> {
  await transaction(async () => {
    const existing = await get<QuoteRow>("SELECT * FROM quote_requests WHERE id = ?", id);
    if (!existing) return;
    const quote = toQuote(existing);
    if (quote.stock_applied) {
      throw new Error("This request has already moved stock. Change the status off Approved before editing lines.");
    }

    await run("DELETE FROM quote_lines WHERE quote_request_id = ?", id);

    const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
    const indicativeValue =
      Math.round(lines.reduce((n, l) => n + (l.unit_price ?? 0) * l.quantity, 0) * 100) / 100;
    const hasBranding = lines.some((l) => (l.branding_placements?.length ?? 0) > 0);

    for (const [i, line] of lines.entries()) {
      await run(
        `INSERT INTO quote_lines (
           id, quote_request_id, sku, article_number, brand, style_name, colour, size,
           quantity, unit_price, line_total, rrp, branding_placements, stock_flag, sort_order
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid(),
        id,
        line.sku,
        line.article_number,
        line.brand,
        line.style_name,
        line.colour,
        line.size,
        line.quantity,
        line.unit_price,
        line.unit_price === null ? null : Math.round(line.unit_price * line.quantity * 100) / 100,
        line.rrp,
        line.branding_placements ? JSON.stringify(line.branding_placements) : null,
        line.stock_flag,
        i,
      );
    }

    await run(
      `UPDATE quote_requests SET
         notes = ?, logo_notes = ?, total_units = ?, indicative_value = ?,
         has_branding = ?, updated_at = ?
       WHERE id = ?`,
      fields.notes === undefined ? quote.notes : fields.notes,
      fields.logo_notes === undefined ? quote.logo_notes : fields.logo_notes,
      totalUnits,
      indicativeValue,
      hasBranding ? 1 : 0,
      now(),
      id,
    );
  });
  await audit("quote.edit", id, { lines: lines.length });
}

export async function updateQuoteFields(
  id: string,
  fields: { quoted_value?: number | null; internal_notes?: string | null },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if ("quoted_value" in fields) {
    sets.push("quoted_value = ?");
    params.push(fields.quoted_value);
  }
  if ("internal_notes" in fields) {
    sets.push("internal_notes = ?");
    params.push(fields.internal_notes);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(now(), id);
  await run(`UPDATE quote_requests SET ${sets.join(", ")} WHERE id = ?`, ...params);
  await audit("quote.update", id, fields);
}

export async function recordNotification(
  id: string,
  channel: "email" | "whatsapp",
  log: NotificationLog,
) {
  const column = channel === "email" ? "notified_email" : "notified_whatsapp";
  await run(
    `UPDATE quote_requests SET ${column} = ?, updated_at = ? WHERE id = ?`,
    JSON.stringify(log),
    now(),
    id,
  );
}

/* -------------------------------------------------------------------------
   Dashboard (§9)
   ---------------------------------------------------------------------- */

export interface DashboardStats {
  awaitingResponse: number;
  /** Requests sitting in `new` for more than 24 hours — an unanswered
   *  corporate enquiry is a lost one (§9). */
  stale: QuoteRequest[];
  thisWeek: number;
  unitsThisMonth: number;
  quotedCount: number;
  wonCount: number;
  conversion: number | null;
  lowStock: number;
  failedNotifications: QuoteRequest[];
  lastImportAt: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const awaiting =
    (await get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests WHERE status = 'new'"))?.n ?? 0;

  const stale = (await all<QuoteRow>(
    `SELECT * FROM quote_requests WHERE status = 'new' AND created_at < ?
      ORDER BY created_at ASC LIMIT 20`,
    dayAgo,
  )).map(toQuote);

  const thisWeek =
    (await get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= ?", weekAgo))
      ?.n ?? 0;

  const unitsThisMonth =
    (await get<{ n: number }>(
      "SELECT COALESCE(SUM(total_units), 0) AS n FROM quote_requests WHERE created_at >= ?",
      monthStart,
    ))?.n ?? 0;

  const quotedCount =
    (await get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM quote_requests WHERE status IN ('quoted','won','lost')",
    ))?.n ?? 0;
  const wonCount =
    (await get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests WHERE status = 'won'"))?.n ?? 0;

  const lowStock =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM variants v JOIN products p ON p.id = v.product_id
        WHERE p.is_visible = 1 AND v.quantity > 0 AND v.quantity < 10`,
    ))?.n ?? 0;

  // A notification that never landed is the failure mode that silently loses a
  // lead, so it is surfaced loudly rather than left in a log (§9).
  const failedNotifications = (await all<QuoteRow>(
    `SELECT * FROM quote_requests
      WHERE notified_email LIKE '%"status":"failed"%'
         OR notified_whatsapp LIKE '%"status":"failed"%'
      ORDER BY created_at DESC LIMIT 20`,
  )).map(toQuote);

  const lastImport = await get<{ created_at: string }>(
    "SELECT created_at FROM stock_imports WHERE status = 'committed' ORDER BY created_at DESC LIMIT 1",
  );

  return {
    awaitingResponse: awaiting,
    stale,
    thisWeek,
    unitsThisMonth,
    quotedCount,
    wonCount,
    conversion: quotedCount > 0 ? wonCount / quotedCount : null,
    lowStock,
    failedNotifications,
    lastImportAt: lastImport?.created_at ?? null,
  };
}
