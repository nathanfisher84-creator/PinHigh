-- Pin High UAE — close the Supabase Data API (Security Advisor: rls_disabled_in_public)
--
-- How to apply
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--   The final SELECT must show rls_enabled = true and policies >= 1 on every
--   public table. Safe to re-run.
--
--   The app also runs this file on boot when DATABASE_URL is set
--   (src/lib/db/core.ts, called from scripts/db-setup.ts during the Vercel
--   build). A production deploy applies it. Paste it here to apply before
--   that deploy, or when the CLI is not linked to the project.
--
-- Why these policies look like a deny
--   Pin High never uses Supabase's REST/Data API or Supabase Auth. Every
--   read and write goes through the Next.js server on the `pg` driver, as
--   the table owner (DATABASE_URL). Table owners bypass row-level security
--   unless it is FORCEd, and this script does not FORCE it. The service
--   role (SUPABASE_SERVICE_ROLE_KEY, used only for Storage) also bypasses
--   RLS. So anon/authenticated policies do not affect the site or the admin.
--
--   A permissive SELECT policy cannot hide columns. Opening products to
--   anon would publish cost_price. Opening settings would publish
--   gmail_app_password. Opening admin_users would publish password hashes
--   and TOTP secrets. Opening quote_* would publish buyer PII and skip the
--   server's validation. The public site already reads the catalogue through
--   the server; it does not need the Data API.
--
-- Who can see what (through the app, which bypasses RLS)
--   Public site, server-rendered:
--     products            buyer-visible rows only (is_visible, not needs_review).
--                         cost_price is never rendered.
--     variants            sizes and quantities for those products
--     product_images      images for those products
--     branding_placements active labels on the quote form
--     settings            public copy only (contact, announcement, hero, home).
--                         The server never sends gmail_app_password to the browser.
--   Public site, server writes (validated, rate-limited):
--     quote_requests, quote_lines, quote_logos   insert on submit
--     stock_alerts                                insert ("email me when back")
--   Admin only, after the app's own session (not Supabase Auth):
--     admin_users, notification_recipients, stock_imports, stock_adjustments,
--     column_mappings, audit_log, plus every update/delete of the tables above
--
-- Data API (anon and authenticated): no access. Each table gets a RESTRICTIVE
-- policy with USING (false), so a later permissive policy cannot open the
-- table until this policy is dropped. Grants to those roles are revoked as well.

DO $rls$
DECLARE
  t record;
  roles text[] := ARRAY[]::text[];
  role_list text;
  note text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    roles := array_append(roles, 'anon');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    roles := array_append(roles, 'authenticated');
  END IF;
  role_list := array_to_string(roles, ', ');

  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    IF 'anon' = ANY (roles) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.tablename);
    END IF;
    IF 'authenticated' = ANY (roles) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t.tablename);
    END IF;

    IF role_list <> '' THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        t.tablename || '_api_deny',
        t.tablename
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %s USING (false) WITH CHECK (false)',
        t.tablename || '_api_deny',
        t.tablename,
        role_list
      );

      note := CASE t.tablename
        WHEN 'products' THEN
          'Data API closed. Public catalogue reads run as the table owner. A SELECT policy would expose cost_price.'
        WHEN 'variants' THEN
          'Data API closed. Size and stock reads run as the table owner, for visible products only.'
        WHEN 'product_images' THEN
          'Data API closed. Image rows are read by the server. The public bucket serves bytes, not this table.'
        WHEN 'branding_placements' THEN
          'Data API closed. The quote form reads active labels through the server.'
        WHEN 'settings' THEN
          'Data API closed. Holds gmail_app_password. Public copy is read by the server and filtered in the app.'
        WHEN 'quote_requests' THEN
          'Data API closed. Buyer PII. The server inserts after validation; admins read and update.'
        WHEN 'quote_lines' THEN
          'Data API closed. Quote contents. Server insert on submit; admin read and edit.'
        WHEN 'quote_logos' THEN
          'Data API closed. Customer artwork paths. Server insert on submit; admin read.'
        WHEN 'stock_alerts' THEN
          'Data API closed. Buyer email addresses. Server insert only.'
        WHEN 'admin_users' THEN
          'Data API closed. Password hashes, TOTP secrets and recovery codes. App session only.'
        WHEN 'notification_recipients' THEN
          'Data API closed. Staff email and WhatsApp numbers. Admin only.'
        WHEN 'stock_imports' THEN
          'Data API closed. Upload history and stock snapshots. Admin only.'
        WHEN 'stock_adjustments' THEN
          'Data API closed. Quantity ledger. Admin only.'
        WHEN 'column_mappings' THEN
          'Data API closed. Saved spreadsheet header map. Admin only.'
        WHEN 'audit_log' THEN
          'Data API closed. Admin action log. Admin only.'
        ELSE
          'Data API closed. No anon or authenticated access. The server connects as table owner and bypasses RLS.'
      END;
      EXECUTE format(
        'COMMENT ON POLICY %I ON public.%I IS %L',
        t.tablename || '_api_deny',
        t.tablename,
        note
      );
    END IF;
  END LOOP;

  IF 'anon' = ANY (roles) THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF 'authenticated' = ANY (roles) THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$rls$;

-- Confirm: every public table has RLS on and at least one policy.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY 1;
