-- Stale-client write gate — DO NOT APPLY until BOTH clients send the header.
--
-- Problem this solves (2026-08-28 stale-browser overwrite): the web app is a
-- PWA. A browser last opened weeks ago serves its old service-worker-cached
-- bundle instantly; that bundle autosaves ~500ms after load with its OLD
-- save logic (delete-all-then-reinsert / unguarded LWW), overwriting the
-- whole System page BEFORE the auto-update can fetch the new build and
-- reload. No client-side fix can reach a bundle that is already cached, so
-- the block has to happen here, at the database.
--
-- Mechanism: PostgREST exposes request headers via
-- current_setting('request.headers'). The web client now sends
-- x-tacular-client: <build> on every request (src/lib/supabase.ts,
-- CLIENT_BUILD). These triggers reject DELETE and UPDATE on planner_rows,
-- and DELETE on archived_weeks, when the header is missing or older than
-- min_client_build. Old bundles never sent the header, so their destructive
-- writes fail loudly instead of silently overwriting. INSERTs are allowed
-- (an insert cannot destroy existing data, and blocking it would strand
-- legitimate first-save paths).
--
-- *** PREREQUISITE — WHY THIS IS NOT APPLIED YET ***
-- The mobile app (tacular-mobile) writes planner_rows directly and does NOT
-- yet send x-tacular-client. Applying this migration today would break every
-- installed mobile build's deletes/updates. Apply only after:
--   1. tacular-mobile ships the same header, and
--   2. enough time has passed (or a forced update) that old mobile builds
--      are gone.
-- Then set min_client_build below to the oldest build allowed to write.
--
-- Non-PostgREST writes (service_role, SQL editor, edge functions) bypass the
-- gate via the pg_has_role check.

CREATE OR REPLACE FUNCTION public.enforce_min_client_build()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_client_build CONSTANT text := '20260828';
  hdrs json;
  client_build text;
BEGIN
  -- Service-role / direct-SQL access is never gated.
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

DROP TRIGGER IF EXISTS planner_rows_min_client_gate ON public.planner_rows;
CREATE TRIGGER planner_rows_min_client_gate
  BEFORE UPDATE OR DELETE ON public.planner_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_client_build();

DROP TRIGGER IF EXISTS archived_weeks_min_client_gate ON public.archived_weeks;
CREATE TRIGGER archived_weeks_min_client_gate
  BEFORE DELETE ON public.archived_weeks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_client_build();
