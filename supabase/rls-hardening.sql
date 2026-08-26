-- Lock every table in the public schema against Supabase's auto-generated
-- Data API (PostgREST). Resolves Security Advisor: rls_disabled_in_public.
--
-- Pin High never uses the Data API: all queries run server-side through the
-- pg driver as the table owner, and owners bypass row-level security. So the
-- least-privilege posture is RLS enabled with NO policies (deny-all for the
-- API roles) plus revoking those roles' grants outright — belt and braces.
--
-- The app applies this automatically on boot (src/lib/db/core.ts, migrate);
-- this standalone copy exists so it can be run by hand in the Supabase SQL
-- Editor — immediately, or on any other project with the same posture.
-- Idempotent: safe to run any number of times.
DO $rls$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.tablename);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t.tablename);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$rls$;

-- Verify: every row should show rowsecurity = true, and the grants query
-- should return no rows for anon / authenticated.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
