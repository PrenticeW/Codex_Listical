-- Tacular: remove duplicate structural rows from planner_rows.
-- Run in Supabase → SQL Editor. Step 1 is read-only; check it before Step 2.
-- The SQL Editor runs as an admin, so the user is picked by email below. Change the email if your Tacular login is different.
-- Structural rows: Inbox divider, Archive header, project header/general/unscheduled rows.
-- The OLDEST copy of each is kept (that is the original); newer copies are removed.

-- ---------- STEP 1: preview what would be deleted ----------
WITH structural AS (
  SELECT
    id, year_id, created_at, display_order,
    CASE
      WHEN (day_entries->'__extra'->>'_isInboxRow') = 'true' THEN 'inbox'
      WHEN (day_entries->'__extra'->>'_rowType') = 'archiveHeader' THEN 'archive'
      WHEN (day_entries->'__extra'->>'_rowType') IN ('projectHeader','projectGeneral','projectUnscheduled')
        THEN (day_entries->'__extra'->>'_rowType') || ':' ||
             COALESCE(project_id::text, day_entries->'__extra'->>'projectNickname', '')
    END AS structural_key
  FROM planner_rows
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'prentice.whitlow@gmail.com')
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY year_id, structural_key ORDER BY created_at, id) AS rn
  FROM structural
  WHERE structural_key IS NOT NULL
)
SELECT year_id, structural_key, id, created_at, display_order
FROM ranked
WHERE rn > 1
ORDER BY year_id, structural_key, created_at;

-- ---------- STEP 2: delete them (only after checking Step 1) ----------
WITH structural AS (
  SELECT
    id, year_id, created_at,
    CASE
      WHEN (day_entries->'__extra'->>'_isInboxRow') = 'true' THEN 'inbox'
      WHEN (day_entries->'__extra'->>'_rowType') = 'archiveHeader' THEN 'archive'
      WHEN (day_entries->'__extra'->>'_rowType') IN ('projectHeader','projectGeneral','projectUnscheduled')
        THEN (day_entries->'__extra'->>'_rowType') || ':' ||
             COALESCE(project_id::text, day_entries->'__extra'->>'projectNickname', '')
    END AS structural_key
  FROM planner_rows
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'prentice.whitlow@gmail.com')
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY year_id, structural_key ORDER BY created_at, id) AS rn
  FROM structural
  WHERE structural_key IS NOT NULL
)
DELETE FROM planner_rows
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ---------- STEP 3 (optional): find doubled task rows ----------
-- Same task text in the same year and project, created within 10 minutes of
-- each other. Review by eye; delete individual ids with:
--   DELETE FROM planner_rows WHERE id = '<paste id>';
SELECT a.id AS keep_id, b.id AS suspect_duplicate_id, a.task, a.created_at, b.created_at
FROM planner_rows a
JOIN planner_rows b
  ON a.user_id = b.user_id AND a.year_id = b.year_id
 AND a.task = b.task AND a.task <> ''
 AND COALESCE(a.project_id::text,'') = COALESCE(b.project_id::text,'')
 AND a.id <> b.id AND a.created_at < b.created_at
 AND b.created_at - a.created_at < interval '10 minutes'
WHERE a.user_id = (SELECT id FROM auth.users WHERE email = 'prentice.whitlow@gmail.com')
ORDER BY a.task;
