-- =========================================================================
-- Drop intrinsic chip duration; rename override column
--
-- Context: helper #4 (tacticsStorage) is about to be ported. The previous
-- migration (20260516000001_planning_schema.sql) gave tactics_chips both
-- duration_minutes and duration_override_minutes. Six months of Plan/System
-- debugging traces back to a stale duration_minutes field: Plan's chip-resize
-- handler updates startRowId/endRowId but never updates durationMinutes, so
-- any persisted intrinsic duration goes stale the moment the user resizes.
--
-- Decision (recorded in MIGRATION_HANDOFF.md and signed off 2026-05-16):
-- duration is a pure derivation from start_row_id + end_row_id + the year's
-- increment_minutes. The only legitimate stored duration is an explicit user
-- override, which now lives in override_minutes (renamed from
-- duration_override_minutes per the handoff naming convention).
--
-- Read-time formula used by both Plan and System:
--   duration_minutes = override_minutes
--                   ?? deriveFromRowIds(start_row_id, end_row_id, increment_minutes)
--
-- Safe to run on dev: no chip data exists in Supabase yet (helper #4 has not
-- ported). On production this is a no-op DROP because production has not
-- received the planning schema yet.
-- =========================================================================

ALTER TABLE tactics_chips
  DROP COLUMN IF EXISTS duration_minutes;

ALTER TABLE tactics_chips
  RENAME COLUMN duration_override_minutes TO override_minutes;
