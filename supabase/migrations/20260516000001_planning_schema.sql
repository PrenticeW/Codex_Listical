-- =========================================================================
-- Listical planning schema (step 2 of SUPABASE_MIGRATION_PLAN.md)
--
-- Replaces the stale 20260102000001_initial_schema.sql planning tables. The
-- old file is left in the migrations directory as a historical record; this
-- migration drops its planning tables before recreating them so a fresh apply
-- against a dev project that already ran the old file ends in the right state.
-- The `profiles` table from the original migration is intentionally left
-- alone; it is still in use by the auth flow.
--
-- Design decisions captured here (see STORAGE_AUDIT.md and the conversation
-- in SUPABASE_MIGRATION_PLAN.md history for context):
--
--   * Calendar header rows (month, week, day, dayofweek, daily-min, daily-max,
--     filter) are NOT stored. The System page reconstructs them on mount from
--     years.start_date, years.total_days, and tactics_metrics.daily_bounds.
--   * Archive week snapshots live in their own table (archived_weeks), not
--     mixed in with planner_rows.
--   * project_id is the join key everywhere. project_nickname is preserved as
--     a display field but never used to join.
--   * Times are stored as INTEGER minutes, not "H.MM" strings.
--   * Boolean settings are real BOOLEAN columns, not 'true' / 'false' strings.
--   * Live and "sent to System" snapshots share a table with an is_sent flag
--     and a partial unique index that allows at most one of each per year.
--   * Row Level Security is intentionally deferred to step 3 of the migration
--     plan. Every table has a user_id column so the policies will be
--     straightforward to add.
--   * created_at and updated_at are universal. The four status timestamps
--     (completed_at, abandoned_at, sent_to_system_at, status_changed_at) from
--     the original plan are NOT added here; per Prentice's note in
--     SUPABASE_MIGRATION_PLAN.md they are placeholders to revisit.
--   * planning_history (version history plan step 1) is included here so the
--     triggers in step 8 have a table to write to. The triggers themselves
--     are not created in this migration.
--
-- =========================================================================

-- -------------------------------------------------------------------------
-- Section 1. Tear down stale tables from 20260102000001_initial_schema.sql
-- -------------------------------------------------------------------------
-- Safe because no production data exists yet (pre-launch). CASCADE drops the
-- old triggers and indexes alongside the tables.

DROP TABLE IF EXISTS user_preferences         CASCADE;
DROP TABLE IF EXISTS tactics_chips            CASCADE;
DROP TABLE IF EXISTS project_weekly_quotas    CASCADE;
DROP TABLE IF EXISTS tactics_daily_bounds     CASCADE;
DROP TABLE IF EXISTS day_entries              CASCADE;
DROP TABLE IF EXISTS planner_rows             CASCADE;
DROP TABLE IF EXISTS subprojects              CASCADE;
DROP TABLE IF EXISTS projects                 CASCADE;
DROP TABLE IF EXISTS years                    CASCADE;

-- profiles is intentionally NOT dropped.

-- -------------------------------------------------------------------------
-- Section 2. Shared trigger helper
-- -------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- Section 3. years
-- -------------------------------------------------------------------------
-- One row per 12-week cycle. status can be active, draft, or archived. The
-- partial unique indexes enforce "at most one active per user" and "at most
-- one draft per user", which is the rule the createDraftYear and
-- performYearArchive flows assume today.

CREATE TABLE years (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_number              INTEGER NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('active', 'draft', 'archived')),
  start_date               DATE NOT NULL,
  end_date                 DATE,
  total_days               INTEGER NOT NULL DEFAULT 84,
  total_weeks_completed         INTEGER NOT NULL DEFAULT 0,
  total_hours_completed_minutes INTEGER NOT NULL DEFAULT 0,  -- accumulated completed work in minutes
  archived_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_number)
);

CREATE INDEX idx_years_user            ON years (user_id);
CREATE INDEX idx_years_user_status     ON years (user_id, status);
CREATE UNIQUE INDEX one_active_year_per_user
  ON years (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX one_draft_year_per_user
  ON years (user_id) WHERE status = 'draft';

CREATE TRIGGER trg_years_updated_at
  BEFORE UPDATE ON years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 4. projects (the Goal page shortlist)
-- -------------------------------------------------------------------------
-- Maps to one entry in stagingStorage's `shortlist` or `archived` array. The
-- 15x6 plan table (with all the row metadata wrapping) is stored as JSONB on
-- plan_table_entries to keep parity with the existing wrap-and-unwrap pattern
-- in stagingStorage. is_archived discriminates shortlist vs archived items.

CREATE TABLE projects (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id                         UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  text                            TEXT NOT NULL DEFAULT '',           -- original user-typed prompt
  project_name                    TEXT,                                -- display name
  project_nickname                TEXT,                                -- DISPLAY ONLY; do not use as join key
  color                           TEXT,                                -- hex or HSL string
  plan_table_visible              BOOLEAN NOT NULL DEFAULT FALSE,
  plan_table_collapsed            BOOLEAN NOT NULL DEFAULT FALSE,
  has_plan                        BOOLEAN NOT NULL DEFAULT FALSE,
  added_to_plan                   BOOLEAN NOT NULL DEFAULT FALSE,
  show_outcome_totals             BOOLEAN NOT NULL DEFAULT FALSE,
  is_simple_table                 BOOLEAN NOT NULL DEFAULT FALSE,
  plan_reason_row_count           INTEGER NOT NULL DEFAULT 1,
  plan_outcome_row_count          INTEGER NOT NULL DEFAULT 1,
  plan_outcome_question_row_count INTEGER NOT NULL DEFAULT 1,
  plan_needs_question_row_count   INTEGER NOT NULL DEFAULT 1,
  plan_needs_plan_row_count       INTEGER NOT NULL DEFAULT 1,
  plan_schedule_row_count         INTEGER NOT NULL DEFAULT 1,  -- maps to planSubprojectRowCount
  plan_subproject_row_count       INTEGER NOT NULL DEFAULT 1,  -- maps to planXxxRowCount
  plan_table_entries              JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: SerializedRow[] from STORAGE_AUDIT.md section 1
  is_archived                     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order                   INTEGER NOT NULL DEFAULT 0,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_user_year      ON projects (user_id, year_id);
CREATE INDEX idx_projects_year_archived  ON projects (year_id, is_archived);
CREATE INDEX idx_projects_year_order     ON projects (year_id, display_order);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 5. planner_rows (System page task rows)
-- -------------------------------------------------------------------------
-- Only real rows live here. The seven calendar header rows are not persisted
-- and are reconstructed on render from years.start_date, years.total_days,
-- and tactics_metrics.daily_bounds. Archive snapshots live in archived_weeks
-- (section 6) and are not stored here.
--
-- row_kind discriminates task vs project-grouping rows. project_id is the
-- single join key to projects. day_entries holds the per-day values as an
-- index-keyed map of minute integers.

CREATE TABLE planner_rows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id             UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  parent_row_id       UUID REFERENCES planner_rows(id) ON DELETE CASCADE,
  row_kind            TEXT NOT NULL CHECK (row_kind IN (
                        'task',
                        'project_header',
                        'project_general',
                        'project_unscheduled',
                        'subproject_general',
                        'subproject_unscheduled'
                      )),
  checkbox            BOOLEAN NOT NULL DEFAULT FALSE,
  subproject_label    TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT '-',
    -- expected values: '-', 'Done', 'Scheduled', 'Not Scheduled', 'Blocked',
    -- 'On Hold', 'Abandoned', 'Skipped', 'Accounted'. Not constrained because
    -- the Plan page still treats it as a free text dropdown.
  task                TEXT NOT NULL DEFAULT '',
  recurring           TEXT NOT NULL DEFAULT '',
  estimate            TEXT NOT NULL DEFAULT '',
  time_value_minutes  INTEGER NOT NULL DEFAULT 0,
  day_entries         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { "0": minutes, "1": minutes, ... } keyed by day index 0..total_days-1
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planner_rows_user_year    ON planner_rows (user_id, year_id);
CREATE INDEX idx_planner_rows_year_project ON planner_rows (year_id, project_id);
CREATE INDEX idx_planner_rows_year_order   ON planner_rows (year_id, display_order);
CREATE INDEX idx_planner_rows_parent       ON planner_rows (parent_row_id);

CREATE TRIGGER trg_planner_rows_updated_at
  BEFORE UPDATE ON planner_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 6. archived_weeks (System page archive snapshots)
-- -------------------------------------------------------------------------
-- One row per "Archive Week" press. snapshot holds the full structural
-- snapshot of that week (projects + subprojects + tasks + recurring tasks)
-- as JSONB; daily_min_minutes and daily_max_minutes mirror the labelled
-- bounds at archive time so they survive future tactics edits.

CREATE TABLE archived_weeks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id              UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  week_number          INTEGER NOT NULL,                  -- 1..12 typically
  week_range_label     TEXT,                              -- e.g. "16 May - 22 May"
  archived_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_minutes        INTEGER,                           -- total hours archived, in minutes
  daily_min_minutes    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: number[7], indices match days of week starting from years.start_day
  daily_max_minutes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot             JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { projects: [...], subprojects: [...], tasks: [...], recurringTasks: [...] }
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id, week_number)
);

CREATE INDEX idx_archived_weeks_user_year ON archived_weeks (user_id, year_id);

CREATE TRIGGER trg_archived_weeks_updated_at
  BEFORE UPDATE ON archived_weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 7. tactics_year_settings (Plan page settings + column widths)
-- -------------------------------------------------------------------------
-- One row per year. Holds the eight per-year settings from
-- loadTacticsYearSettings plus column_widths, folding the previous
-- tactics-column-widths-{N} key naming anomaly into the same row.

CREATE TABLE tactics_year_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id             UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  start_hour          TEXT NOT NULL DEFAULT '',
  start_minute        TEXT NOT NULL DEFAULT '',
  increment_minutes   INTEGER NOT NULL DEFAULT 60,
  show_am_pm          BOOLEAN NOT NULL DEFAULT TRUE,
  use_24_hour         BOOLEAN NOT NULL DEFAULT FALSE,
  start_day           TEXT NOT NULL DEFAULT 'Sunday'
    CHECK (start_day IN ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  chip_display_modes  JSONB NOT NULL
    DEFAULT '{"__default__":{"duration":false,"clock":false}}'::jsonb,
    -- shape: { "__default__": {duration, clock}, [projectId]?: {duration, clock} }
  summary_row_order   JSONB,
    -- shape: string[] | null; null means use the default ordering
  column_widths       JSONB,
    -- shape: number[]; index 0 is the time column, indices 1+ are day/project columns
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id)
);

CREATE TRIGGER trg_tactics_year_settings_updated_at
  BEFORE UPDATE ON tactics_year_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 8. tactics_metrics (live + sent snapshot)
-- -------------------------------------------------------------------------
-- Holds dailyBounds, projectWeeklyQuotas, and weeklyTotals for both the live
-- Plan page autosave and the frozen sent-to-system snapshot. The is_sent
-- flag plus two partial unique indexes enforce "exactly one of each per
-- (user, year)" without resorting to parallel *_sent tables.

CREATE TABLE tactics_metrics (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id                         UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  is_sent                         BOOLEAN NOT NULL DEFAULT FALSE,
  daily_bounds                    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: [{ day: 'Sunday', daily_max_minutes, daily_min_minutes }, ...] length 7
  project_weekly_quotas           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: [{ project_id: UUID, label, weekly_minutes }, ...]
  weekly_total_available_minutes  INTEGER NOT NULL DEFAULT 0,
  weekly_total_working_minutes    INTEGER NOT NULL DEFAULT 0,
  sent_at                         TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_live_metrics_per_year
  ON tactics_metrics (user_id, year_id) WHERE is_sent = FALSE;
CREATE UNIQUE INDEX one_sent_metrics_per_year
  ON tactics_metrics (user_id, year_id) WHERE is_sent = TRUE;
CREATE INDEX idx_tactics_metrics_year_sent
  ON tactics_metrics (year_id, is_sent);

CREATE TRIGGER trg_tactics_metrics_updated_at
  BEFORE UPDATE ON tactics_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 9. tactics_custom_projects (Plan-page-only custom chip projects)
-- -------------------------------------------------------------------------
-- One row per custom project. is_sent mirrors the live + sent layering used
-- by tactics_chips and tactics_metrics so the System page sees a consistent
-- snapshot at Send time.

CREATE TABLE tactics_custom_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id      UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
    -- the 'custom-1' style id referenced by tactics_chips.project_id_external
  label        TEXT NOT NULL,
  color        TEXT NOT NULL,
  is_sent      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id, external_id, is_sent)
);

CREATE INDEX idx_tactics_custom_projects_year
  ON tactics_custom_projects (year_id, is_sent);

CREATE TRIGGER trg_tactics_custom_projects_updated_at
  BEFORE UPDATE ON tactics_custom_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 10. tactics_chips (live + sent snapshot, fixed)
-- -------------------------------------------------------------------------
-- Each row is one chip on the Plan grid. column_index is no longer bounded
-- to 0..6: project-column chips set column_index >= 7. day_name and the
-- duration fields are first-class columns rather than missing. The
-- chipTimeOverrides map collapses into duration_override_minutes.
--
-- project_id_external intentionally stays TEXT because a chip's project can
-- be a project UUID (cast to text), a builtin like 'sleep' / 'wake', or a
-- tactics_custom_projects.external_id. Hard FK constraints are out of scope
-- for this migration.

CREATE TABLE tactics_chips (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id                    UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  is_sent                    BOOLEAN NOT NULL DEFAULT FALSE,
  chip_id                    TEXT NOT NULL,           -- stable client-side id
  column_index               INTEGER NOT NULL CHECK (column_index >= 0),
    -- 0..6 = day columns; >=7 = project columns
  day_name                   TEXT
    CHECK (day_name IS NULL OR day_name IN
      ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  start_row_id               TEXT NOT NULL,
  end_row_id                 TEXT NOT NULL,
  start_minutes              INTEGER,                 -- clock minutes since midnight, derived from start_row_id
  project_id_external        TEXT NOT NULL,
  display_label              TEXT,                    -- optional override label, e.g. for Schedule chips
  duration_minutes           INTEGER,                 -- intrinsic duration
  duration_override_minutes  INTEGER,                 -- override; wins over duration_minutes when set
  user_modified              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id, chip_id, is_sent)
);

CREATE INDEX idx_tactics_chips_year_sent ON tactics_chips (year_id, is_sent);

CREATE TRIGGER trg_tactics_chips_updated_at
  BEFORE UPDATE ON tactics_chips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 11. planner_settings (System page UI prefs per year)
-- -------------------------------------------------------------------------
-- Single row per year covering everything plannerStorage holds besides the
-- task rows themselves (which live in planner_rows). The current code base
-- always uses 'project-1' as projectId, so a single row per year is enough.
-- If multi-project ever ships, projectId can be added as a column without
-- changing this row's shape.

CREATE TABLE planner_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id                  UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  size_scale               NUMERIC NOT NULL DEFAULT 1.0
    CHECK (size_scale >= 0.5 AND size_scale <= 3.0),
  show_recurring           BOOLEAN NOT NULL DEFAULT TRUE,
  show_subprojects         BOOLEAN NOT NULL DEFAULT TRUE,
  show_max_min_rows        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_statuses            JSONB NOT NULL DEFAULT
    '["Done","Scheduled","Not Scheduled","Blocked","On Hold","Abandoned","Skipped","Accounted"]'::jsonb,
  sort_planner_statuses    JSONB NOT NULL DEFAULT
    '["Done","Scheduled","Not Scheduled","Blocked","On Hold","Abandoned","Skipped","Accounted"]'::jsonb,
  column_sizing            JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { [columnId]: pixelWidth }
  visible_day_columns      JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { "day-0": boolean, "day-1": boolean, ... }
  collapsed_groups         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- shape: string[] of collapsed group ids
  send_to_system_at        TIMESTAMPTZ,
    -- replaces the localStorage tactics-year-{N}-send-to-system-ts marker
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id)
);

CREATE TRIGGER trg_planner_settings_updated_at
  BEFORE UPDATE ON planner_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Section 12. planning_history (version history plan step 1)
-- -------------------------------------------------------------------------
-- Holds the previous version of any planning row that gets updated or
-- deleted. The trigger functions that populate it are NOT created in this
-- migration; that work is step 2 of VERSION_HISTORY_PLAN.md. Adding the
-- table now means the triggers can attach later without another schema
-- change.

CREATE TABLE planning_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name     TEXT NOT NULL,
  row_id         UUID NOT NULL,
  previous_data  JSONB NOT NULL,
  operation      TEXT NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_history_lookup
  ON planning_history (user_id, table_name, row_id, changed_at DESC);

-- planning_history intentionally has no updated_at; rows are immutable.

-- -------------------------------------------------------------------------
-- Section 13. profiles.current_year_id (which year the UI is showing)
-- -------------------------------------------------------------------------
-- Replaces the `currentYear` field on the legacy app-year-metadata blob. It
-- is a user-level pointer at one of the rows in `years`. Nullable so a fresh
-- profile can exist before the first year is created; ON DELETE SET NULL so
-- deleting a year does not cascade-delete the user.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_year_id UUID REFERENCES years(id) ON DELETE SET NULL;

-- =========================================================================
-- End of migration
-- =========================================================================
