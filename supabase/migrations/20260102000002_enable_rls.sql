-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE years ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subprojects ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactics_daily_bounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_weekly_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactics_chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Years policies
CREATE POLICY "Users can view own years"
  ON years FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own years"
  ON years FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own years"
  ON years FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own years"
  ON years FOR DELETE
  USING (auth.uid() = user_id);

-- Projects policies
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Subprojects policies (access through parent project)
CREATE POLICY "Users can view subprojects of own projects"
  ON subprojects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = subprojects.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert subprojects to own projects"
  ON subprojects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = subprojects.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update subprojects of own projects"
  ON subprojects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = subprojects.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete subprojects of own projects"
  ON subprojects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = subprojects.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Planner rows policies
CREATE POLICY "Users can view own planner rows"
  ON planner_rows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own planner rows"
  ON planner_rows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own planner rows"
  ON planner_rows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own planner rows"
  ON planner_rows FOR DELETE
  USING (auth.uid() = user_id);

-- Day entries policies (access through parent planner row)
CREATE POLICY "Users can view day entries of own rows"
  ON day_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM planner_rows
      WHERE planner_rows.id = day_entries.planner_row_id
      AND planner_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert day entries to own rows"
  ON day_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planner_rows
      WHERE planner_rows.id = day_entries.planner_row_id
      AND planner_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update day entries of own rows"
  ON day_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM planner_rows
      WHERE planner_rows.id = day_entries.planner_row_id
      AND planner_rows.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete day entries of own rows"
  ON day_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM planner_rows
      WHERE planner_rows.id = day_entries.planner_row_id
      AND planner_rows.user_id = auth.uid()
    )
  );

-- Tactics daily bounds policies
CREATE POLICY "Users can view own tactics daily bounds"
  ON tactics_daily_bounds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tactics daily bounds"
  ON tactics_daily_bounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tactics daily bounds"
  ON tactics_daily_bounds FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tactics daily bounds"
  ON tactics_daily_bounds FOR DELETE
  USING (auth.uid() = user_id);

-- Project weekly quotas policies
CREATE POLICY "Users can view own project quotas"
  ON project_weekly_quotas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project quotas"
  ON project_weekly_quotas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project quotas"
  ON project_weekly_quotas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project quotas"
  ON project_weekly_quotas FOR DELETE
  USING (auth.uid() = user_id);

-- Tactics chips policies
CREATE POLICY "Users can view own tactics chips"
  ON tactics_chips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tactics chips"
  ON tactics_chips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tactics chips"
  ON tactics_chips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tactics chips"
  ON tactics_chips FOR DELETE
  USING (auth.uid() = user_id);

-- User preferences policies
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE
  USING (auth.uid() = user_id);
