-- 2026-10-02: DB backstop for structural row identity (see CLAUDE.md,
-- "Structural row identity"). One row per (user, year, structural key).
-- APPLIED MANUALLY via the Supabase SQL editor on 2026-10-02.
-- If you add a new structural row type, extend this expression together
-- with structuralKey/clientStructuralKeys in src/utils/planner/storage.js.
CREATE UNIQUE INDEX IF NOT EXISTS planner_rows_structural_uniq ON planner_rows (user_id, year_id, (
  CASE
    WHEN day_entries->'__extra'->>'_isInboxRow' = 'true' THEN 'inbox'
    WHEN day_entries->'__extra'->>'_rowType' = 'archiveHeader' THEN 'archive'
    WHEN day_entries->'__extra'->>'_rowType' IN ('projectHeader','projectGeneral','projectUnscheduled')
      THEN (day_entries->'__extra'->>'_rowType') || ':' ||
           coalesce(project_id::text, day_entries->'__extra'->>'projectNickname','')
    WHEN day_entries->'__extra'->>'_rowType' = 'subprojectHeader'
         AND coalesce(day_entries->'__extra'->>'_chipGroupKey', day_entries->'__extra'->>'_chipId') IS NOT NULL
      THEN 'chipHeader:' || coalesce(day_entries->'__extra'->>'_chipGroupKey', day_entries->'__extra'->>'_chipId')
    WHEN day_entries->'__extra'->>'_rowType' = 'projectTask' AND day_entries->'__extra'->>'_chipId' IS NOT NULL
      THEN 'chipTask:' || (day_entries->'__extra'->>'_chipId')
    WHEN day_entries->'__extra'->>'_rowType' = 'deletedChip'
      THEN 'tombstone:' || coalesce(day_entries->'__extra'->>'_chipGroupKey', day_entries->'__extra'->>'_chipId','')
  END
)) WHERE day_entries->'__extra' IS NOT NULL;
