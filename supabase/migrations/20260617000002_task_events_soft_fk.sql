-- =========================================================================
-- Drop the ON DELETE CASCADE from task_events.task_id.
--
-- The planner uses a replace-the-layer save pattern (delete all rows for a
-- year, then bulk-insert them back). With CASCADE set, every save wipes ALL
-- task_events for the year. Removing the FK entirely makes task_events an
-- append-only audit log that survives the delete/re-insert cycle.
-- =========================================================================

ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_task_id_fkey;
