-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Years/Cycles table (12-week planning periods)
CREATE TABLE years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  start_date DATE NOT NULL,
  end_date DATE,
  archived_at TIMESTAMPTZ,
  total_weeks_completed INTEGER DEFAULT 0,
  total_hours_completed DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year_number)
);

-- Projects (from Staging/Shortlist)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  project_nickname TEXT,
  color TEXT,
  plan_table_visible BOOLEAN DEFAULT FALSE,
  plan_table_collapsed BOOLEAN DEFAULT FALSE,
  plan_table_entries JSONB DEFAULT '[]'::jsonb,
  plan_reason_row_count INTEGER DEFAULT 1,
  plan_outcome_row_count INTEGER DEFAULT 1,
  plan_outcome_question_row_count INTEGER DEFAULT 1,
  plan_needs_question_row_count INTEGER DEFAULT 1,
  plan_needs_plan_row_count INTEGER DEFAULT 1,
  plan_subproject_row_count INTEGER DEFAULT 1,
  plan_xxx_row_count INTEGER DEFAULT 1,
  is_archived BOOLEAN DEFAULT FALSE,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subprojects (extracted from project plan summaries)
CREATE TABLE subprojects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  time_value TEXT,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Planner tasks/rows
CREATE TABLE planner_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE NOT NULL,
  row_id TEXT NOT NULL,
  row_type TEXT NOT NULL,

  -- Hierarchy
  group_id TEXT,
  parent_group_id TEXT,

  -- Project references
  project_name TEXT,
  project_nickname TEXT,
  subproject_label TEXT,

  -- Task data
  row_num TEXT,
  checkbox BOOLEAN,
  project TEXT,
  subproject TEXT,
  status TEXT,
  task TEXT,
  recurring TEXT,
  estimate TEXT,
  time_value TEXT,

  -- Archive metadata
  archive_week_label TEXT,
  archive_total_hours DECIMAL,

  -- Display order
  display_order INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year_id, row_id)
);

-- Day entries for tasks (normalizes the 84 dynamic day columns)
CREATE TABLE day_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_row_id UUID REFERENCES planner_rows(id) ON DELETE CASCADE NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index >= 0 AND day_index < 84),
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(planner_row_id, day_index)
);

-- Tactics daily bounds (min/max hours per day of week)
CREATE TABLE tactics_daily_bounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  daily_min_hours DECIMAL DEFAULT 0,
  daily_max_hours DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year_id, day_of_week)
);

-- Project weekly quotas
CREATE TABLE project_weekly_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE NOT NULL,
  project_label TEXT NOT NULL,
  weekly_hours DECIMAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year_id, project_label)
);

-- Tactics time chips/blocks
CREATE TABLE tactics_chips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE NOT NULL,
  chip_id TEXT NOT NULL,
  label TEXT,
  project_id TEXT,
  column_index INTEGER CHECK (column_index >= 0 AND column_index <= 6),
  start_row_id TEXT,
  end_row_id TEXT,
  color TEXT,
  is_custom_project BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences (UI settings per year)
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year_id UUID REFERENCES years(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year_id, setting_key)
);

-- Create indexes for performance
CREATE INDEX idx_years_user_id ON years(user_id);
CREATE INDEX idx_years_status ON years(status);
CREATE INDEX idx_years_user_status ON years(user_id, status);

CREATE INDEX idx_projects_user_year ON projects(user_id, year_id);
CREATE INDEX idx_projects_archived ON projects(is_archived);
CREATE INDEX idx_projects_year_archived ON projects(year_id, is_archived);

CREATE INDEX idx_subprojects_project ON subprojects(project_id);

CREATE INDEX idx_planner_rows_user_year ON planner_rows(user_id, year_id);
CREATE INDEX idx_planner_rows_type ON planner_rows(row_type);
CREATE INDEX idx_planner_rows_group ON planner_rows(group_id);

CREATE INDEX idx_day_entries_row ON day_entries(planner_row_id);
CREATE INDEX idx_day_entries_day ON day_entries(day_index);

CREATE INDEX idx_tactics_daily_bounds_user_year ON tactics_daily_bounds(user_id, year_id);
CREATE INDEX idx_project_quotas_user_year ON project_weekly_quotas(user_id, year_id);
CREATE INDEX idx_tactics_chips_user_year ON tactics_chips(user_id, year_id);
CREATE INDEX idx_user_preferences_user_year ON user_preferences(user_id, year_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_years_updated_at BEFORE UPDATE ON years
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subprojects_updated_at BEFORE UPDATE ON subprojects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planner_rows_updated_at BEFORE UPDATE ON planner_rows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_day_entries_updated_at BEFORE UPDATE ON day_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tactics_daily_bounds_updated_at BEFORE UPDATE ON tactics_daily_bounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_weekly_quotas_updated_at BEFORE UPDATE ON project_weekly_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tactics_chips_updated_at BEFORE UPDATE ON tactics_chips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
