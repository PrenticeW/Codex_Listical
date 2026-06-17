-- =========================================================================
-- Change task_events.task_id from UUID to TEXT.
--
-- Most planner rows carry non-UUID identifiers (placeholder IDs like 'row-0'
-- or chip-injected IDs like 'chip-task-chip-...') that are valid within a
-- session but are not Postgres UUID values. Keeping task_id as UUID forces
-- a 400 on every read/write for those rows. Since the FK was dropped in
-- 20260617000002, there is no constraint left that requires UUID type.
-- =========================================================================

ALTER TABLE task_events ALTER COLUMN task_id TYPE TEXT;
