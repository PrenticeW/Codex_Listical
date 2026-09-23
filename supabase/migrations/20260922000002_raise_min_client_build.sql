-- Raise the stale-client write gate to the order-key builds (2026-09-22).
--
-- The 2026-09-21/22 reorder + duplicate-insertion incidents were both done
-- by pre-fix cached bundles. Web (CLIENT_BUILD '20260922') and mobile
-- (tacular-mobile lib/supabase.js, same value) now use per-row order_key
-- and never renumber; this bump locks every earlier build out of
-- UPDATE/DELETE on planner_rows and DELETE on archived_weeks, so an old
-- PWA cache or an un-updated phone can corrupt nothing while it waits for
-- its auto-update.
--
-- Applied to the live DB 2026-09-23, after the 20260922 web deploy and the
-- 20260922 TestFlight build were both installed.

CREATE OR REPLACE FUNCTION public.enforce_min_client_build()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_client_build CONSTANT text := '20260922';
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
