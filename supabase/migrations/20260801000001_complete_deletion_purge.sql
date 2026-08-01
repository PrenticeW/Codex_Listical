-- =========================================================================
-- Complete the account-deletion purge (Right to Erasure hardening)
--
-- The original deletion migration (20260120000002) predates most of the
-- current schema: task_events, chip_task_notes, site_snapshots,
-- archived_weeks, tactics_* tables, planner_settings, deletion_rate_limits,
-- and the theme/DOB columns on profiles. Until now the hard-delete relied
-- entirely on ON DELETE CASCADE from auth.users, with no explicit purge and
-- no verification that zero rows remained.
--
-- This migration adds two SECURITY DEFINER functions (service-role only):
--
--   1. purge_user_data(target_user_id)
--      Explicitly deletes every row of user data from every current table,
--      in dependency order, and hard-deletes the profiles row (the audit
--      trail lives in deletion_audit_log as a SHA-256 hash, so no PII needs
--      to survive). Returns a per-table count of rows deleted.
--
--   2. count_remaining_user_data(target_user_id)
--      DYNAMIC verifier: scans information_schema for every table in the
--      public schema that has a uuid user_id column (plus profiles.id) and
--      counts surviving rows. Because it discovers tables at runtime, any
--      table added in the future is automatically covered — a new table can
--      never silently escape the purge. The cron job calls this after the
--      purge and refuses to mark the deletion 'completed' unless the total
--      is zero.
--
-- deletion_audit_log is intentionally excluded: it stores only a hashed
-- user id (no PII) and is the record that erasure happened.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Explicit purge
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_user_data(target_user_id UUID)
RETURNS TABLE (table_name TEXT, rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n BIGINT;
BEGIN
  -- Leaf / append-only tables first ---------------------------------------

  -- task_events has no FK to planner_rows any more (dropped in
  -- 20260617000002) but still keys on user_id.
  DELETE FROM task_events WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'task_events'; rows_deleted := n; RETURN NEXT;

  DELETE FROM chip_task_notes WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'chip_task_notes'; rows_deleted := n; RETURN NEXT;

  DELETE FROM site_snapshots WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'site_snapshots'; rows_deleted := n; RETURN NEXT;

  DELETE FROM archived_weeks WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'archived_weeks'; rows_deleted := n; RETURN NEXT;

  DELETE FROM tactics_chips WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'tactics_chips'; rows_deleted := n; RETURN NEXT;

  DELETE FROM tactics_custom_projects WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'tactics_custom_projects'; rows_deleted := n; RETURN NEXT;

  DELETE FROM tactics_metrics WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'tactics_metrics'; rows_deleted := n; RETURN NEXT;

  DELETE FROM tactics_year_settings WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'tactics_year_settings'; rows_deleted := n; RETURN NEXT;

  DELETE FROM planner_settings WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'planner_settings'; rows_deleted := n; RETURN NEXT;

  -- planner_rows self-references via parent_row_id ON DELETE CASCADE, so a
  -- single user-scoped delete removes whole subtrees.
  DELETE FROM planner_rows WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'planner_rows'; rows_deleted := n; RETURN NEXT;

  DELETE FROM projects WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'projects'; rows_deleted := n; RETURN NEXT;

  -- profiles.current_year_id references years ON DELETE SET NULL, so
  -- deleting years before profiles is safe.
  DELETE FROM years WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'years'; rows_deleted := n; RETURN NEXT;

  DELETE FROM deletion_rate_limits WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'deletion_rate_limits'; rows_deleted := n; RETURN NEXT;

  -- Hard-delete the profile row itself: it holds email, full name, avatar
  -- URL, date of birth, and theme preference. The deletion_audit_log row
  -- (hashed id only) is the surviving record of the erasure.
  DELETE FROM profiles WHERE id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'profiles'; rows_deleted := n; RETURN NEXT;

  RETURN;
END;
$$;

-- -------------------------------------------------------------------------
-- 2. Dynamic verification
-- -------------------------------------------------------------------------
-- Discovers, at call time, every public-schema table with a uuid user_id
-- column (plus profiles.id) and counts rows still belonging to the user.
-- New tables are covered automatically the day they are created.
CREATE OR REPLACE FUNCTION public.count_remaining_user_data(target_user_id UUID)
RETURNS TABLE (table_name TEXT, remaining_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  n BIGINT;
BEGIN
  FOR t IN
    SELECT c.table_name AS tname
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND c.data_type = 'uuid'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> 'deletion_audit_log'  -- hash-only audit trail
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t.tname)
      INTO n USING target_user_id;
    IF n > 0 THEN
      table_name := t.tname; remaining_rows := n; RETURN NEXT;
    END IF;
  END LOOP;

  -- profiles keys on id, not user_id
  SELECT count(*) INTO n FROM profiles WHERE id = target_user_id;
  IF n > 0 THEN
    table_name := 'profiles'; remaining_rows := n; RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- -------------------------------------------------------------------------
-- 3. Lock down to service role
-- -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.purge_user_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_user_data(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.count_remaining_user_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_remaining_user_data(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_remaining_user_data(UUID) TO service_role;

COMMENT ON FUNCTION public.purge_user_data IS
  'Explicitly deletes all user data from every table (Right to Erasure). Service role only.';
COMMENT ON FUNCTION public.count_remaining_user_data IS
  'Dynamically verifies zero user rows remain after purge; auto-covers future tables with a user_id column.';

-- =========================================================================
-- End of migration
-- =========================================================================
