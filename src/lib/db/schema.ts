/**
 * Schema (spec §3).
 *
 * Written for SQLite so the application runs end to end without a provisioned
 * Supabase project. `supabase/migrations/0001_init.sql` carries the same shape
 * in Postgres with the RLS policies §11 requires; `src/lib/db/index.ts` is the
 * single seam to swap over. Column names, types and constraints are kept
 * identical on both sides so nothing above the repository layer has to change.
 *
 * Two rules the schema itself enforces, because they are the ones that would
 * quietly destroy value if left to application code:
 *   - article_number and sku are TEXT and UNIQUE. Leading zeros survive.
 *   - quote_lines carries a full text snapshot and has no foreign key to
 *     products, so renaming or hiding a style next season cannot corrupt a
 *     historic quote (§3, "Critical").
 */

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,
  article_number    TEXT NOT NULL UNIQUE,
  brand             TEXT NOT NULL,
  style_group       TEXT,
  style_name        TEXT NOT NULL,
  condition         TEXT NOT NULL DEFAULT 'new'
                      CHECK (condition IN ('new','pre-owned','ex-display')),
  colour            TEXT NOT NULL,
  colour_hex        TEXT,
  category          TEXT NOT NULL,
  gender            TEXT NOT NULL CHECK (gender IN ('mens','ladies','junior','unisex')),
  description       TEXT,
  fabric            TEXT,
  season            TEXT,
  price_wholesale   REAL,
  rrp               REAL,
  -- What Pin High paid adidas. Admin-only and never rendered publicly —
  -- the invoice import carries it, and exposing a distributor's cost to its
  -- own customers would be a commercial own goal.
  cost_price        REAL,
  -- Set when a product arrived from an invoice with no name, colour, category
  -- or gender. The admin lists these until the owner fills them in.
  needs_review      INTEGER NOT NULL DEFAULT 0,
  case_pack         INTEGER,
  moq               INTEGER,
  is_visible        INTEGER NOT NULL DEFAULT 1,
  is_discontinued   INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_style_group ON products(style_group);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS variants (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  size        TEXT NOT NULL,
  size_order  INTEGER NOT NULL DEFAULT 0,
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at  TEXT NOT NULL,
  UNIQUE (product_id, size)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  alt_text      TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);

CREATE TABLE IF NOT EXISTS stock_imports (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  storage_path    TEXT,
  uploaded_by     TEXT,
  mode            TEXT NOT NULL CHECK (mode IN ('replace','upsert','add','set','details')),
  rows_total      INTEGER NOT NULL DEFAULT 0,
  rows_created    INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_zeroed     INTEGER NOT NULL DEFAULT 0,
  rows_failed     INTEGER NOT NULL DEFAULT 0,
  error_log       TEXT,
  snapshot_before TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','committed','rolled_back','failed')),
  -- adidas invoice numbers applied by this import, so the same delivery
  -- cannot be counted into stock twice.
  invoice_refs    TEXT,
  -- adidas sales orders covered, so an invoice for an order already
  -- imported from an implementation file is not counted twice.
  order_refs      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  company_name      TEXT NOT NULL,
  trn               TEXT,
  contact_name      TEXT NOT NULL,
  contact_role      TEXT,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,
  delivery_emirate  TEXT NOT NULL,
  required_by       TEXT,
  notes             TEXT,
  total_units       INTEGER NOT NULL DEFAULT 0,
  indicative_value  REAL NOT NULL DEFAULT 0,
  has_branding      INTEGER NOT NULL DEFAULT 0,
  logo_path         TEXT,
  logo_notes        TEXT,
  status            TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','in_progress','quoted','won','lost','expired')),
  quoted_value      REAL,
  internal_notes    TEXT,
  notified_email    TEXT NOT NULL DEFAULT '[]',
  notified_whatsapp TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quote_requests(created_at);

-- Deliberately no FK to products or variants. This table is the historic
-- record and must survive the catalogue changing underneath it (§3).
CREATE TABLE IF NOT EXISTS quote_lines (
  id                  TEXT PRIMARY KEY,
  quote_request_id    TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  sku                 TEXT NOT NULL,
  article_number      TEXT NOT NULL,
  brand               TEXT NOT NULL,
  style_name          TEXT NOT NULL,
  colour              TEXT NOT NULL,
  size                TEXT NOT NULL,
  quantity            INTEGER NOT NULL,
  unit_price          REAL,
  line_total          REAL,
  branding_placements TEXT,
  stock_flag          TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lines_quote ON quote_lines(quote_request_id);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  channel   TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  value     TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  receives  TEXT NOT NULL DEFAULT '["quote_request"]'
);

CREATE TABLE IF NOT EXISTS branding_placements (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_placements_category ON branding_placements(category);

CREATE TABLE IF NOT EXISTS admin_users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A manual column mapping the owner confirmed once, reused on later uploads
-- so an oddly-named column is mapped once rather than every month (§4.1).
CREATE TABLE IF NOT EXISTS column_mappings (
  header     TEXT PRIMARY KEY,
  field_key  TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- "Email me when back" capture on a sold-out size run (§4.3).
CREATE TABLE IF NOT EXISTS stock_alerts (
  id             TEXT PRIMARY KEY,
  article_number TEXT NOT NULL,
  email          TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  notified_at    TEXT,
  UNIQUE (article_number, email)
);

-- Audit log of admin actions (§11 security).
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor      TEXT,
  action     TEXT NOT NULL,
  subject    TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
`;
