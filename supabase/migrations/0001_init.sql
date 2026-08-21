-- Pin High UAE — Postgres schema with Row Level Security
-- Spec §3 (data model), §11 (security).
--
-- This is the production target named in spec §2. The running application
-- currently uses the SQLite schema in src/lib/db/schema.ts, which mirrors this
-- shape column for column; src/lib/db/index.ts is the single seam to swap.
--
-- The security posture this file encodes:
--   * RLS is enabled on every table, with no permissive default.
--   * The public (anon) role can read the catalogue and nothing else.
--   * The public role can INSERT a quote request but can never read one back —
--     quote references are guessable and they carry buyers' contact details.
--   * Everything else requires an authenticated admin.
--
-- Apply with: supabase db push, or paste into the SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type product_condition as enum ('new', 'pre-owned', 'ex-display');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_gender as enum ('mens', 'ladies', 'junior', 'unisex');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status as enum
    ('new', 'in_progress', 'quoted', 'won', 'lost', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type import_mode as enum ('replace', 'upsert');
exception when duplicate_object then null; end $$;

do $$ begin
  create type import_status as enum
    ('pending', 'committed', 'rolled_back', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notify_channel as enum ('email', 'whatsapp');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Admin users (extends auth.users)
-- ---------------------------------------------------------------------------

create table if not exists admin_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

-- Used by every admin policy below. SECURITY DEFINER so the check itself is
-- not subject to RLS on admin_users, which would recurse.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  -- TEXT, not numeric. Article numbers are opaque and leading zeros matter (§3).
  article_number  text not null unique,
  brand           text not null,
  style_group     text,
  style_name      text not null,
  condition       product_condition not null default 'new',
  colour          text not null,
  colour_hex      text,
  category        text not null,
  gender          product_gender not null,
  description     text,
  fabric          text,
  season          text,
  price_wholesale numeric(10, 2),
  rrp             numeric(10, 2),
  case_pack       integer check (case_pack is null or case_pack > 0),
  moq             integer check (moq is null or moq > 0),
  is_visible      boolean not null default true,
  is_discontinued boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_products_style_group on products (style_group);
create index if not exists idx_products_brand on products (brand);
create index if not exists idx_products_category on products (category);
create index if not exists idx_products_visible on products (is_visible) where is_visible;

-- Search across style name, colour, article number and brand (§6.2).
create index if not exists idx_products_search on products
  using gin (to_tsvector('english',
    coalesce(style_name, '') || ' ' || coalesce(colour, '') || ' ' ||
    coalesce(brand, '') || ' ' || coalesce(article_number, '')));

create table if not exists variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku        text not null unique,
  size       text not null,
  size_order integer not null default 0,
  quantity   integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, size)
);

create index if not exists idx_variants_product on variants (product_id);

create table if not exists product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  storage_path text not null,
  alt_text     text,
  is_primary   boolean not null default false,
  sort_order   integer not null default 0
);

create index if not exists idx_images_product on product_images (product_id);

-- ---------------------------------------------------------------------------
-- Stock imports
-- ---------------------------------------------------------------------------

create table if not exists stock_imports (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  storage_path    text,
  uploaded_by     uuid references auth.users(id),
  mode            import_mode not null,
  rows_total      integer not null default 0,
  rows_created    integer not null default 0,
  rows_updated    integer not null default 0,
  rows_zeroed     integer not null default 0,
  rows_failed     integer not null default 0,
  error_log       jsonb,
  -- Powers the 30-day rollback (§4.2 step 6).
  snapshot_before jsonb,
  status          import_status not null default 'pending',
  created_at      timestamptz not null default now()
);

create index if not exists idx_imports_created on stock_imports (created_at desc);

-- ---------------------------------------------------------------------------
-- Quote requests
-- ---------------------------------------------------------------------------

create table if not exists quote_requests (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  company_name      text not null,
  trn               text,
  contact_name      text not null,
  contact_role      text,
  email             text not null,
  phone             text not null,
  delivery_emirate  text not null,
  required_by       date,
  notes             text,
  total_units       integer not null default 0,
  indicative_value  numeric(12, 2) not null default 0,
  has_branding      boolean not null default false,
  logo_path         text,
  logo_notes        text,
  status            quote_status not null default 'new',
  quoted_value      numeric(12, 2),
  internal_notes    text,
  notified_email    jsonb not null default '[]'::jsonb,
  notified_whatsapp jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_quotes_status on quote_requests (status);
create index if not exists idx_quotes_created on quote_requests (created_at desc);
create index if not exists idx_quotes_branded on quote_requests (has_branding);

-- No foreign key to products, deliberately. This is the historic record and
-- must still read correctly after a style is renamed or hidden (§3, "Critical").
create table if not exists quote_lines (
  id                  uuid primary key default gen_random_uuid(),
  quote_request_id    uuid not null references quote_requests(id) on delete cascade,
  sku                 text not null,
  article_number      text not null,
  brand               text not null,
  style_name          text not null,
  colour              text not null,
  size                text not null,
  quantity            integer not null check (quantity > 0),
  unit_price          numeric(10, 2),
  line_total          numeric(12, 2),
  branding_placements jsonb,
  stock_flag          text,
  sort_order          integer not null default 0
);

create index if not exists idx_lines_quote on quote_lines (quote_request_id);

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

create table if not exists notification_recipients (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  channel   notify_channel not null,
  value     text not null,
  is_active boolean not null default true,
  receives  jsonb not null default '["quote_request"]'::jsonb
);

create table if not exists branding_placements (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

create index if not exists idx_placements_category on branding_placements (category);

create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists column_mappings (
  header     text primary key,
  field_key  text not null,
  updated_at timestamptz not null default now()
);

create table if not exists stock_alerts (
  id             uuid primary key default gen_random_uuid(),
  article_number text not null,
  email          text not null,
  created_at     timestamptz not null default now(),
  notified_at    timestamptz,
  unique (article_number, email)
);

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text,
  action     text not null,
  subject    text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_touch on products;
create trigger products_touch before update on products
  for each row execute function touch_updated_at();

drop trigger if exists variants_touch on variants;
create trigger variants_touch before update on variants
  for each row execute function touch_updated_at();

drop trigger if exists quotes_touch on quote_requests;
create trigger quotes_touch before update on quote_requests
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — §11: "RLS on every table"
-- ---------------------------------------------------------------------------

alter table products                enable row level security;
alter table variants                enable row level security;
alter table product_images          enable row level security;
alter table stock_imports           enable row level security;
alter table quote_requests          enable row level security;
alter table quote_lines             enable row level security;
alter table notification_recipients enable row level security;
alter table branding_placements     enable row level security;
alter table settings                enable row level security;
alter table column_mappings         enable row level security;
alter table stock_alerts            enable row level security;
alter table audit_log               enable row level security;
alter table admin_users             enable row level security;

-- -- Public read of the catalogue only ---------------------------------------
-- Non-new stock is filtered in the application against the show_non_new_stock
-- setting (§15.7); the policy keeps hidden products invisible regardless.

drop policy if exists products_public_read on products;
create policy products_public_read on products
  for select to anon, authenticated
  using (is_visible = true);

drop policy if exists variants_public_read on variants;
create policy variants_public_read on variants
  for select to anon, authenticated
  using (exists (
    select 1 from products p where p.id = variants.product_id and p.is_visible
  ));

drop policy if exists images_public_read on product_images;
create policy images_public_read on product_images
  for select to anon, authenticated
  using (exists (
    select 1 from products p where p.id = product_images.product_id and p.is_visible
  ));

drop policy if exists placements_public_read on branding_placements;
create policy placements_public_read on branding_placements
  for select to anon, authenticated
  using (is_active = true);

-- Settings the public UI needs (stock date, announcement, response time).
-- Restricted by key so nothing sensitive is ever added to this table and
-- accidentally exposed.
drop policy if exists settings_public_read on settings;
create policy settings_public_read on settings
  for select to anon, authenticated
  using (key in (
    'last_import_at', 'announcement', 'branding_min_units',
    'quote_response_hours', 'contact_email', 'contact_phone',
    'contact_whatsapp', 'show_non_new_stock'
  ));

-- -- Public write: quote requests, insert only ------------------------------
-- A buyer may submit. Nobody unauthenticated may read a request back:
-- references are sequential and therefore guessable, and the rows carry
-- company names, contact details and phone numbers.

drop policy if exists quotes_public_insert on quote_requests;
create policy quotes_public_insert on quote_requests
  for insert to anon, authenticated
  with check (true);

drop policy if exists lines_public_insert on quote_lines;
create policy lines_public_insert on quote_lines
  for insert to anon, authenticated
  with check (true);

drop policy if exists alerts_public_insert on stock_alerts;
create policy alerts_public_insert on stock_alerts
  for insert to anon, authenticated
  with check (true);

-- -- Admin: full access -----------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'products', 'variants', 'product_images', 'stock_imports',
    'quote_requests', 'quote_lines', 'notification_recipients',
    'branding_placements', 'settings', 'column_mappings',
    'stock_alerts', 'audit_log'
  ] loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())',
      t, t
    );
  end loop;
end $$;

drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select to authenticated
  using (id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Product images are public; customer artwork is not. §8: logo files are
-- customers' trademarks and get signed-URL access only.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('quote-artwork', 'quote-artwork', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('stock-uploads', 'stock-uploads', false)
on conflict (id) do nothing;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

-- A buyer may upload artwork and never read any back.
drop policy if exists artwork_public_insert on storage.objects;
create policy artwork_public_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'quote-artwork');

drop policy if exists artwork_admin_read on storage.objects;
create policy artwork_admin_read on storage.objects
  for select to authenticated
  using (bucket_id in ('quote-artwork', 'stock-uploads') and is_admin());

drop policy if exists storage_admin_write on storage.objects;
create policy storage_admin_write on storage.objects
  for all to authenticated
  using (
    bucket_id in ('product-images', 'quote-artwork', 'stock-uploads') and is_admin()
  )
  with check (
    bucket_id in ('product-images', 'quote-artwork', 'stock-uploads') and is_admin()
  );
