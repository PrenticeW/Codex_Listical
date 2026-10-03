-- =========================================================================
-- Allow 'time' as a task_events field.
--
-- Scheduled-time changes (Estimate dropdown confirm, typing into a day
-- column, direct Value-cell edit, Multi per-instance time edits) now write
-- one event per committed change so they show in the task history.
-- Values are stored in the H.MM convention (2 hours 50 minutes = '2.50').
-- =========================================================================

ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_field_check;
ALTER TABLE task_events ADD CONSTRAINT task_events_field_check
  CHECK (field IN ('status', 'task_name', 'notes', 'time'));
