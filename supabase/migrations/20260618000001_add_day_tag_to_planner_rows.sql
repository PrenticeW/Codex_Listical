-- Add day_tag and day_tag_locked columns to planner_rows for the day-filter feature.
-- day_tag: auto-detected or user-set day abbreviation (Mon/Tue/Wed/Thu/Fri/Sat/Sun), NULL means no day association.
-- day_tag_locked: true when the user has manually set day_tag via the side panel; prevents parse-on-write from overwriting it.

ALTER TABLE planner_rows
  ADD COLUMN IF NOT EXISTS day_tag TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS day_tag_locked BOOLEAN NOT NULL DEFAULT FALSE;
