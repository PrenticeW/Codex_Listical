-- projects.project_tagline — the short line shown after the project name on
-- System project header rows (web ProjectRow, mobile SystemScreen).
--
-- The Goal page has had an "Add tagline" inline field for a while, but the
-- value only lived in React state: stagingStorage never mapped it and there
-- was no column, so it vanished on reload and never reached System (which
-- copies it onto the header row only when a project is first sent over).
-- This column makes projects the single source of truth; System header rows
-- keep a synced copy in day_entries.__extra.projectTagline for mobile.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_tagline TEXT;
