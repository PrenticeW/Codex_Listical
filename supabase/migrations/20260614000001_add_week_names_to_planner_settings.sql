-- Add week_names JSONB column to planner_settings
-- Stores a map of week number → custom label, e.g. { "1": "Week 1", "2": "Sprint 2" }
-- Null / missing keys fall back to the default "Week N" label in the UI.

ALTER TABLE planner_settings
  ADD COLUMN IF NOT EXISTS week_names JSONB DEFAULT NULL;
