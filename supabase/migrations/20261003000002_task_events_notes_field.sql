-- =========================================================================
-- Allow 'notes' as a task_events field.
--
-- The task panel now writes one event per committed note edit (blur /
-- add-link confirm), so note additions and changes show in the status
-- history. Applied to the live project 2026-10-03.
-- =========================================================================

ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_field_check;
ALTER TABLE task_events ADD CONSTRAINT task_events_field_check
  CHECK (field IN ('status', 'task_name', 'notes'));
