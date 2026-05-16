-- =========================================================================
-- Listical planning Row Level Security (step 3 of SUPABASE_MIGRATION_PLAN.md)
--
-- Turns on Row Level Security for every planning table created in
-- 20260516000001_planning_schema.sql and attaches a single "owner only"
-- policy per table. The rule is the same for every table: a row is
-- visible / writable only when its user_id matches the currently
-- authenticated user (auth.uid()).
--
-- profiles is the one exception: its primary key column IS the user id, so
-- the policy keys on id rather than user_id.
--
-- The combined `FOR ALL ... USING ... WITH CHECK` form below is equivalent
-- to four separate policies (SELECT, INSERT, UPDATE, DELETE) all keyed on
-- the same predicate. Postgres applies USING for SELECT/UPDATE/DELETE and
-- WITH CHECK for INSERT/UPDATE.
--
-- Triggers run with table-owner privileges and bypass RLS, so the
-- updated_at trigger and the future planning_history trigger are
-- unaffected by these policies.
-- =========================================================================

-- -------------------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_owner ON profiles;
CREATE POLICY profiles_owner ON profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -------------------------------------------------------------------------
-- years
-- -------------------------------------------------------------------------
ALTER TABLE years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS years_owner ON years;
CREATE POLICY years_owner ON years
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- projects
-- -------------------------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_owner ON projects;
CREATE POLICY projects_owner ON projects
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- planner_rows
-- -------------------------------------------------------------------------
ALTER TABLE planner_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_rows_owner ON planner_rows;
CREATE POLICY planner_rows_owner ON planner_rows
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- archived_weeks
-- -------------------------------------------------------------------------
ALTER TABLE archived_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archived_weeks_owner ON archived_weeks;
CREATE POLICY archived_weeks_owner ON archived_weeks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- tactics_year_settings
-- -------------------------------------------------------------------------
ALTER TABLE tactics_year_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tactics_year_settings_owner ON tactics_year_settings;
CREATE POLICY tactics_year_settings_owner ON tactics_year_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- tactics_metrics
-- -------------------------------------------------------------------------
ALTER TABLE tactics_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tactics_metrics_owner ON tactics_metrics;
CREATE POLICY tactics_metrics_owner ON tactics_metrics
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- tactics_custom_projects
-- -------------------------------------------------------------------------
ALTER TABLE tactics_custom_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tactics_custom_projects_owner ON tactics_custom_projects;
CREATE POLICY tactics_custom_projects_owner ON tactics_custom_projects
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- tactics_chips
-- -------------------------------------------------------------------------
ALTER TABLE tactics_chips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tactics_chips_owner ON tactics_chips;
CREATE POLICY tactics_chips_owner ON tactics_chips
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- planner_settings
-- -------------------------------------------------------------------------
ALTER TABLE planner_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_settings_owner ON planner_settings;
CREATE POLICY planner_settings_owner ON planner_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- planning_history
-- -------------------------------------------------------------------------
-- Users can SELECT their own history but should not be able to insert,
-- update, or delete history rows directly. Only the change-tracking trigger
-- (added in VERSION_HISTORY_PLAN.md step 2) writes to this table, and
-- triggers bypass RLS regardless.
ALTER TABLE planning_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_history_select ON planning_history;
CREATE POLICY planning_history_select ON planning_history
  FOR SELECT
  USING (user_id = auth.uid());

-- =========================================================================
-- End of migration
-- =========================================================================
