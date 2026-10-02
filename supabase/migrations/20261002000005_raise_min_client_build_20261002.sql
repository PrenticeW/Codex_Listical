-- Raise the stale-client write gate to the crypto-capable builds (2026-10-02).
--
-- Web CLIENT_BUILD and mobile (tacular-mobile lib/supabase.js) are both
-- '20261002': the builds that decrypt projects.plan_table_entries_enc and
-- carry the SystemScreen day-filter header fix. This bump locks every
-- earlier build out of the gated destructive writes before 'projects' is
-- added to web ENCRYPT_WRITE_TABLES, so a stale client cannot write
-- plaintext over encrypted project rows or mis-render them
-- (docs/encryption-plan.md, projects flip order step 3).
--
-- Applied after the 20261002 TestFlight build was confirmed installed on
-- the phone (2026-10-02 evening).

CREATE OR REPLACE FUNCTION public.enforce_min_client_build()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_client_build CONSTANT text := '20261002';
  hdrs json;
  client_build text;
BEGIN
  IF pg_has_role(current_user, 'service_role', 'member')
     OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    hdrs := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    hdrs := NULL;
  END;
  client_build := hdrs ->> 'x-tacular-client';

  IF client_build IS NULL OR client_build < min_client_build THEN
    RAISE EXCEPTION 'stale client build % (need >= %): destructive planner writes refused — reload the app',
      COALESCE(client_build, 'none'), min_client_build
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
