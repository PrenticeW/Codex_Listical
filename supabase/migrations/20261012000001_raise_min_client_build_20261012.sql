-- Raise the stale-client write gate to the intent-gated-delete builds
-- (2026-10-12, two-machine 131-row wipe — see docs/known-issues.md).
--
-- Web CLIENT_BUILD and mobile (tacular-mobile lib/supabase.js) are both
-- '20261012': the builds whose planner save only deletes rows registered
-- via markRowsDeleted (web) / per-op deletes (mobile, unchanged semantics,
-- stamp bumped in step with web). This bump locks every earlier build —
-- including service-worker-cached web bundles that still derive deletes
-- from absence — out of the gated destructive writes.
--
-- DO NOT APPLY until BOTH:
--   1. the 20261012 web build is deployed to production, and
--   2. the 20261012 TestFlight build is installed on the phone
-- — otherwise the live clients lose destructive planner writes.

CREATE OR REPLACE FUNCTION public.enforce_min_client_build()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_client_build CONSTANT text := '20261012';
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
