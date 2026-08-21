/**
 * Domain types. Mirrors the data model in spec §3.
 *
 * The load-bearing rule: `article_number` is the primary identity. One article
 * number is one product in one colour, and it owns its own size run. Treat it
 * as an opaque string — never parse it for meaning, and never store it as a
 * number, or leading zeros die.
 */

export const CATEGORIES = [
  "polos",
  "t-shirts",
  "mid-layers",
  "outerwear",
  "trousers",
  "shorts",
  "skorts",
  "caps",
  "gloves",
  "shoes",
  "belts",
  "socks",
  "golf-bags",
  "balls",
  "clubs",
  "junior-sets",
  "rangefinders",
  "trolleys",
  "towels",
  "umbrellas",
  "accessories",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GENDERS = ["mens", "ladies", "junior", "unisex"] as const;
export type Gender = (typeof GENDERS)[number];

export const CONDITIONS = ["new", "pre-owned", "ex-display"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const QUOTE_STATUSES = [
  "new",
  "in_progress",
  "quoted",
  "won",
  "lost",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;
export type Emirate = (typeof EMIRATES)[number];

export interface Product {
  id: string;
  article_number: string;
  brand: string;
  style_group: string | null;
  style_name: string;
  condition: Condition;
  colour: string;
  colour_hex: string | null;
  category: Category;
  gender: Gender;
  description: string | null;
  fabric: string | null;
  season: string | null;
  price_wholesale: number | null;
  rrp: number | null;
  /** Admin-only. Never rendered publicly. */
  cost_price: number | null;
  needs_review: boolean;
  case_pack: number | null;
  moq: number | null;
  is_visible: boolean;
  is_discontinued: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  size_order: number;
  quantity: number;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
}

/** A product with everything the catalogue needs to render it. */
export interface ProductWithVariants extends Product {
  variants: Variant[];
  images: ProductImage[];
  /** Sibling colourways sharing this product's style_group. Empty when null. */
  siblings?: ColourwayRef[];
}

export interface ColourwayRef {
  article_number: string;
  colour: string;
  colour_hex: string | null;
  total_quantity: number;
  primary_image: string | null;
}

export interface QuoteLine {
  id: string;
  quote_request_id: string;
  sku: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  size: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  branding_placements: string[] | null;
  /** Set when availability moved between submission and the team opening it. */
  stock_flag: string | null;
}

export interface QuoteRequest {
  id: string;
  reference: string;
  company_name: string;
  trn: string | null;
  contact_name: string;
  contact_role: string | null;
  email: string;
  phone: string;
  delivery_emirate: string;
  required_by: string | null;
  notes: string | null;
  total_units: number;
  indicative_value: number;
  has_branding: boolean;
  logo_path: string | null;
  logo_notes: string | null;
  status: QuoteStatus;
  quoted_value: number | null;
  internal_notes: string | null;
  notified_email: NotificationLog;
  notified_whatsapp: NotificationLog;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequestWithLines extends QuoteRequest {
  lines: QuoteLine[];
}

export type NotificationLog = Array<{
  recipient: string;
  name: string;
  status: "sent" | "failed" | "pending" | "skipped";
  detail?: string;
  attempts: number;
  at: string;
}>;

export interface NotificationRecipient {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  value: string;
  is_active: boolean;
  receives: string[];
}

export interface BrandingPlacement {
  id: string;
  category: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export interface StockImport {
  id: string;
  filename: string;
  storage_path: string | null;
  uploaded_by: string | null;
  mode: "replace" | "upsert";
  rows_total: number;
  rows_created: number;
  rows_updated: number;
  rows_zeroed: number;
  rows_failed: number;
  error_log: unknown;
  snapshot_before: unknown;
  status: "pending" | "committed" | "rolled_back" | "failed";
  created_at: string;
}

/* -------------------------------------------------------------------------
   Display helpers
   ---------------------------------------------------------------------- */

export const CATEGORY_LABELS: Record<Category, string> = {
  polos: "Polos",
  "t-shirts": "T-Shirts",
  "mid-layers": "Mid-Layers",
  outerwear: "Outerwear",
  trousers: "Trousers",
  shorts: "Shorts",
  skorts: "Skorts",
  caps: "Caps",
  gloves: "Gloves",
  shoes: "Shoes",
  belts: "Belts",
  socks: "Socks",
  "golf-bags": "Golf Bags",
  balls: "Balls",
  clubs: "Clubs",
  "junior-sets": "Junior Sets",
  rangefinders: "Rangefinders",
  trolleys: "Trolleys",
  towels: "Towels",
  umbrellas: "Umbrellas",
  accessories: "Accessories",
};

export const GENDER_LABELS: Record<Gender, string> = {
  mens: "Mens",
  ladies: "Ladies",
  junior: "Junior",
  unisex: "Unisex",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  "pre-owned": "Pre-owned",
  "ex-display": "Ex-display",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "New",
  in_progress: "In progress",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
  expired: "Expired",
};
