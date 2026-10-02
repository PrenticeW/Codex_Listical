-- 2026-10-02 duplicate structure incident (docs/known-issues.md).
-- Dedupe one-per-year/project/chip structural rows: merge each duplicate
-- group's user data (non-empty day cells, max completion_count, longest
-- notes, checkbox OR) into the richest copy, delete the rest.
-- APPLIED MANUALLY via the Supabase SQL editor on 2026-10-02 (134 rows
-- removed); kept here for the record. Running it again is a no-op.

BEGIN;

CREATE TEMP TABLE dup_rank AS
WITH keyed AS (
  SELECT id, user_id, year_id, created_at, updated_at, notes, completion_count,
    (SELECT count(*) FROM jsonb_each_text(coalesce(day_entries->'__cells','{}'::jsonb)) kv
      WHERE kv.value <> '') AS realcells,
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
    END AS skey
  FROM planner_rows
),
ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY user_id, year_id, skey
    ORDER BY realcells DESC, coalesce(completion_count,0) DESC,
             coalesce(length(notes),0) DESC, created_at ASC) AS rn
  FROM keyed WHERE skey IS NOT NULL
)
SELECT id, user_id, year_id, skey, rn,
  first_value(id) OVER (PARTITION BY user_id, year_id, skey ORDER BY rn) AS keeper_id
FROM ranked
WHERE (user_id, year_id, skey) IN (
  SELECT user_id, year_id, skey FROM ranked GROUP BY 1,2,3 HAVING count(*) > 1);

UPDATE planner_rows pr SET
  day_entries = jsonb_set(pr.day_entries, '{__cells}', coalesce(m.cells, coalesce(pr.day_entries->'__cells','{}'::jsonb))),
  completion_count = greatest(coalesce(pr.completion_count,0), m.cc),
  notes = coalesce(m.notes, pr.notes),
  last_completed_at = greatest(coalesce(pr.last_completed_at, m.lca), coalesce(m.lca, pr.last_completed_at)),
  checkbox = pr.checkbox OR m.cb
FROM (
  SELECT d.keeper_id,
    (SELECT jsonb_object_agg(s.key, s.val) FROM (
       SELECT DISTINCT ON (kv.key) kv.key, kv.value AS val
       FROM dup_rank d2 JOIN planner_rows p2 ON p2.id = d2.id
       CROSS JOIN LATERAL jsonb_each(coalesce(p2.day_entries->'__cells','{}'::jsonb)) kv
       WHERE d2.keeper_id = d.keeper_id AND kv.value::text <> '""'
       ORDER BY kv.key, p2.updated_at DESC) s) AS cells,
    max(coalesce(p.completion_count,0)) AS cc,
    max(p.last_completed_at) AS lca,
    bool_or(coalesce(p.checkbox,false)) AS cb,
    (SELECT p3.notes FROM dup_rank d3 JOIN planner_rows p3 ON p3.id = d3.id
      WHERE d3.keeper_id = d.keeper_id AND p3.notes IS NOT NULL
      ORDER BY length(p3.notes) DESC LIMIT 1) AS notes
  FROM dup_rank d JOIN planner_rows p ON p.id = d.id
  GROUP BY d.keeper_id
) m
WHERE pr.id = m.keeper_id;

DELETE FROM planner_rows WHERE id IN (SELECT id FROM dup_rank WHERE id <> keeper_id);

DROP TABLE dup_rank;

COMMIT;
