-- =========================================================================
-- Deletion purge completeness: user_keys + planning_history + statuses
--
-- Encryption plan § Knock-ons: account deletion must also delete the user's
-- wrapped-DEK row in user_keys, or a deleted account orphans its key
-- material. While fixing that, scripts/verify-export-tables.mjs flagged two
-- more tables created after 20260801000001 that purge_user_data never
-- learned about: planning_history (trigger-written row history, carries
-- previous_data copies of planner_rows content) and statuses (user status
-- config). All three cascade from auth.users, and count_remaining_user_data
-- discovers them dynamically (each has a uuid user_id column) — so the purge
-- verifier would have refused to mark a deletion 'completed' — but the
-- explicit purge is the belt-and-braces layer and must list them.
--
-- Redefines purge_user_data in full (CREATE OR REPLACE keeps the existing
-- service-role-only grants). Order: the three new deletes join the leaf
-- tables — none of them is referenced by anything else.
-- =========================================================================

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

  -- Trigger-written history of planner_rows edits (20260827000001). Delete
  -- BEFORE planner_rows so the delete-trigger on planner_rows doesn't write
  -- fresh history rows after this table has been swept. (Even if it does,
  -- they'd belong to target_user_id and the dynamic verifier would catch
  -- them — the ordering just keeps the purge single-pass.)
  DELETE FROM planning_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'planning_history'; rows_deleted := n; RETURN NEXT;

  -- planner_rows self-references via parent_row_id ON DELETE CASCADE, so a
  -- single user-scoped delete removes whole subtrees.
  DELETE FROM planner_rows WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'planner_rows'; rows_deleted := n; RETURN NEXT;

  -- Re-sweep planning_history: the planner_rows delete above fires the
  -- history trigger, which may have just written tombstone rows.
  DELETE FROM planning_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'planning_history'; rows_deleted := n; RETURN NEXT; -- 2nd sweep

  DELETE FROM projects WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'projects'; rows_deleted := n; RETURN NEXT;

  -- User status configuration (20260831000001).
  DELETE FROM statuses WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'statuses'; rows_deleted := n; RETURN NEXT;

  -- profiles.current_year_id references years ON DELETE SET NULL, so
  -- deleting years before profiles is safe.
  DELETE FROM years WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'years'; rows_deleted := n; RETURN NEXT;

  DELETE FROM deletion_rate_limits WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'deletion_rate_limits'; rows_deleted := n; RETURN NEXT;

  -- Wrapped per-user data key (encryption plan § Knock-ons). Deleting it
  -- renders any missed ciphertext permanently unreadable — crypto-shredding
  -- on top of the row deletes above.
  DELETE FROM user_keys WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'user_keys'; rows_deleted := n; RETURN NEXT;

  -- Hard-delete the profile row itself: it holds email, full name, avatar
  -- URL, date of birth, and theme preference. The deletion_audit_log row
  -- (hashed id only) is the surviving record of the erasure.
  DELETE FROM profiles WHERE id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'profiles'; rows_deleted := n; RETURN NEXT;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.purge_user_data IS
  'Explicitly deletes all user data from every table (Right to Erasure), incl. user_keys/planning_history/statuses (20261002000006). Service role only.';

-- =========================================================================
-- End of migration
-- =========================================================================
