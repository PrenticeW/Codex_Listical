-- Adds per-goal toggle for showing estimate/time cells on Actions rows
-- in the Goal page plan table. Defaults to FALSE (times hidden).

ALTER TABLE projects
  ADD COLUMN show_action_times BOOLEAN NOT NULL DEFAULT FALSE;
