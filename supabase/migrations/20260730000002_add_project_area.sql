-- Adds an optional Area designation to Goal page projects.
-- One of 'personal' | 'social' | 'growth' | 'duties', stored lowercase;
-- NULL means unset (a valid, neutral state). No backfill.

ALTER TABLE projects
  ADD COLUMN area TEXT
  CONSTRAINT projects_area_check
  CHECK (area IS NULL OR area IN ('personal', 'social', 'growth', 'duties'));
