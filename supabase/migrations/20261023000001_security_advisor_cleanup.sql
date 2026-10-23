-- Security advisor cleanup (2026-10-23). Applied to dev and production via MCP.
-- 1) Drop obsolete backup/rescue tables flagged by the security advisor
--    (two from 2026-10-17 had RLS disabled and were publicly accessible).
DROP TABLE IF EXISTS public.planner_rows_backup_20261017;
DROP TABLE IF EXISTS public.planner_rows_orderkey_backup_20261017;
DROP TABLE IF EXISTS public.planner_rows_backup_20261003_archive_repair;
DROP TABLE IF EXISTS public.planner_rows_backup_20261003_prelink;
DROP TABLE IF EXISTS public.planner_rows_orderkey_backup_20261003;
DROP TABLE IF EXISTS public.projects_backup_20261003_prelink;
DROP TABLE IF EXISTS public.rescue_20261002_planner_rows;
DROP TABLE IF EXISTS public.rescue_20261002_site_snapshots;

-- 2) Lock down SECURITY DEFINER functions. These are only ever called
--    server-side (Vercel /api + edge functions) with the service role key,
--    or fired as triggers; clients must not be able to call them via
--    /rest/v1/rpc. Service role access is unaffected.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.check_deletion_rate_limit(uuid)',
    'public.complete_account_deletion(uuid, uuid)',
    'public.enforce_min_client_build()',
    'public.fail_account_deletion(uuid)',
    'public.handle_new_user()',
    'public.handle_updated_at()',
    'public.planner_rows_keep_project()',
    'public.planner_rows_write_history()',
    'public.planning_history_prune()',
    'public.record_deletion_attempt(uuid)',
    'public.request_account_deletion(uuid)',
    'public.validate_age_requirement()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;

-- 3) Drop leftover recovery table from the 2026-10-03 incident (user-confirmed dead).
DROP TABLE IF EXISTS public.recovery_dropbox_20261003;
