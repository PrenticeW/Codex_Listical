-- statuses — per-user editable status chips (docs/STATUS_MANAGER_SPEC.md).
--
-- Replaces the hardcoded status constants (DROPDOWN_OPTIONS / PILLBOX_COLORS
-- / TERMINAL_STATUSES / ARCHIVE_SWEEP_STATUSES etc.) with data. Task rows
-- keep storing status ids as text; for pre-existing statuses the id IS the
-- historical label ("Done", "Blocked", …) so no planner_rows migration is
-- needed. New custom statuses get generated ids ("st_<random>"); labels are
-- display-only and freely renameable.
--
-- Soft delete: active=false keeps the record so archived weeks still render
-- the chip's label and colour. locked=true marks statuses the app needs to
-- function ('-', Not Scheduled, Scheduled, Done): undeletable, unrenameable.
-- archive_sweep doubles as the "counts as finished" flag (Archive Week sweep
-- + Multi-row terminal semantics + sort target 'general').
--
-- Seeding is client-side: ensureDefaultStatuses() in
-- src/lib/statusesStorage.js inserts the defaults for any user whose list is
-- empty, on first load. Per-user (not per-year): custom statuses follow the
-- user into new years.

CREATE TABLE IF NOT EXISTS statuses (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id            text        NOT NULL,
  label         text        NOT NULL,
  bg            text        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  archive_sweep boolean     NOT NULL DEFAULT false,
  built_in      boolean     NOT NULL DEFAULT false,
  locked        boolean     NOT NULL DEFAULT false,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS statuses_user_id_idx ON statuses (user_id);

ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own statuses"
  ON statuses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own statuses"
  ON statuses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own statuses"
  ON statuses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own statuses"
  ON statuses FOR DELETE
  USING (auth.uid() = user_id);
