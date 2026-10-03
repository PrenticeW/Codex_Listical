-- 2026-10-03 gym-rows incident (docs/known-issues.md): archived copies of
-- chip tasks keep _rowType 'projectTask' + _chipId, and archived custom
-- subproject rows keep their original _rowType, so the structural unique
-- index treated every weekly archived copy as the SAME row as the live one
-- — at most one could exist per year, and client-side adoption collapsed
-- and deleted the rest. Rebuild the index to exclude anything archived:
-- _isArchivedTask, an archived* _rowType, or a parentGroupId inside the
-- archive ('archived-…' group ids, 'archive-week-…' parked rows).
DROP INDEX IF EXISTS planner_rows_structural_uniq;
CREATE UNIQUE INDEX planner_rows_structural_uniq ON public.planner_rows USING btree (user_id, year_id, (
CASE
    WHEN (((day_entries -> '__extra'::text) ->> '_isInboxRow'::text) = 'true'::text) THEN 'inbox'::text
    WHEN (((day_entries -> '__extra'::text) ->> '_rowType'::text) = 'archiveHeader'::text) THEN 'archive'::text
    WHEN (((day_entries -> '__extra'::text) ->> '_rowType'::text) = ANY (ARRAY['projectHeader'::text, 'projectGeneral'::text, 'projectUnscheduled'::text])) THEN ((((day_entries -> '__extra'::text) ->> '_rowType'::text) || ':'::text) || COALESCE((project_id)::text, ((day_entries -> '__extra'::text) ->> 'projectNickname'::text), ''::text))
    WHEN ((((day_entries -> '__extra'::text) ->> '_rowType'::text) = 'subprojectHeader'::text) AND (COALESCE(((day_entries -> '__extra'::text) ->> '_chipGroupKey'::text), ((day_entries -> '__extra'::text) ->> '_chipId'::text)) IS NOT NULL)) THEN ('chipHeader:'::text || COALESCE(((day_entries -> '__extra'::text) ->> '_chipGroupKey'::text), ((day_entries -> '__extra'::text) ->> '_chipId'::text)))
    WHEN ((((day_entries -> '__extra'::text) ->> '_rowType'::text) = 'projectTask'::text) AND (((day_entries -> '__extra'::text) ->> '_chipId'::text) IS NOT NULL)) THEN ('chipTask:'::text || ((day_entries -> '__extra'::text) ->> '_chipId'::text))
    WHEN (((day_entries -> '__extra'::text) ->> '_rowType'::text) = 'deletedChip'::text) THEN ('tombstone:'::text || COALESCE(((day_entries -> '__extra'::text) ->> '_chipGroupKey'::text), ((day_entries -> '__extra'::text) ->> '_chipId'::text), ''::text))
    ELSE NULL::text
END))
WHERE (day_entries -> '__extra'::text) IS NOT NULL
  AND COALESCE((day_entries -> '__extra'::text) ->> '_isArchivedTask', '') <> 'true'
  AND COALESCE((day_entries -> '__extra'::text) ->> '_rowType', '') NOT LIKE 'archived%'
  AND COALESCE((day_entries -> '__extra'::text) ->> 'parentGroupId', '') NOT LIKE 'archived-%'
  AND COALESCE((day_entries -> '__extra'::text) ->> 'parentGroupId', '') NOT LIKE 'archive-week-%';
