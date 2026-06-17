-- =========================================================================
-- Task panel: new planner_rows columns + task_events table
--
-- Backs the "shell only" features listed in docs/task-panel-handover.md:
--   * Notes textarea   → notes column on planner_rows
--   * Status / name history → task_events table
--   * Created date + age  → task_created_at column on planner_rows
--   * Recurring block     → completion_count + last_completed_at columns
-- =========================================================================


-- -------------------------------------------------------------------------
-- Section 1. New columns on planner_rows
-- -------------------------------------------------------------------------

-- Free-text notes saved per task. Nullable; null means no note written yet.
ALTER TABLE planner_rows
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Timestamp of when the task name was first entered. Separate from the
-- built-in created_at because rows are created empty (blank task name) and
-- can sit nameless for an indeterminate time. Stamped in storage.js when the
-- task name transitions from '' to a non-empty string for the first time.
ALTER TABLE planner_rows
  ADD COLUMN IF NOT EXISTS task_created_at TIMESTAMPTZ;

-- Running count of times a recurring task was set to Done. Non-recurring tasks
-- leave this at 0. Incremented at status-change time (not at Archive Week time).
ALTER TABLE planner_rows
  ADD COLUMN IF NOT EXISTS completion_count INTEGER NOT NULL DEFAULT 0;

-- Most recent Done timestamp for recurring tasks. Non-recurring tasks leave
-- this null. Completed-at for non-recurring tasks is read from the task_events
-- row where field='status' and new_value='Done'.
ALTER TABLE planner_rows
  ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMPTZ;


-- -------------------------------------------------------------------------
-- Section 2. task_events table
-- -------------------------------------------------------------------------
-- One row per user-driven field change. Currently tracks status changes
-- (field = 'status') and task name changes (field = 'task_name'). The note
-- column is optional, meaningful for Blocked / On Hold status transitions.
--
-- Rows are append-only; the application never updates or deletes events.
-- The planning_history trigger (VERSION_HISTORY_PLAN.md step 2) will
-- NOT mirror this table — task_events is its own audit log.

CREATE TABLE IF NOT EXISTS task_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES planner_rows(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field       TEXT        NOT NULL CHECK (field IN ('status', 'task_name')),
  old_value   TEXT,         -- null on the very first status set (no prior value)
  new_value   TEXT        NOT NULL,
  note        TEXT,         -- optional user note, e.g. reason for Blocked
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id
  ON task_events (task_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_events_user_id
  ON task_events (user_id);

-- RLS: same "owner only" pattern used by every other planning table.
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_events_owner ON task_events
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- End of migration
-- =========================================================================
