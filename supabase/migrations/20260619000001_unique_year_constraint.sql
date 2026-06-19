-- =============================================================================
-- Deduplicate years rows and enforce UNIQUE (user_id, year_number).
--
-- Root cause: the UNIQUE constraint was present in the migration file but
-- absent from some deployed databases. Multiple test-run archive cycles could
-- therefore create duplicate rows for the same year number. This caused
-- findYearIdByNumber (and all callers) to fail with PGRST116 on any year that
-- had duplicates, silently breaking every save for that year.
--
-- Step 1: Remove duplicate rows. For each (user_id, year_number) pair that
-- has more than one row, keep the one with the most recent created_at (most
-- likely the row from the last successful archive cycle) and delete the rest.
-- Deletion cascades through every year-scoped table: projects, planner_rows,
-- archived_weeks, planner_settings, tactics_*, chip_task_notes, etc.
--
-- Step 2: Add the UNIQUE constraint if it does not already exist, so no
-- future duplicates can form.
-- =============================================================================

-- Step 1: Delete duplicate year rows (keep latest created_at per user+year).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, year_number
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM years
)
DELETE FROM years
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Add the unique constraint if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'years_user_id_year_number_key'
      AND conrelid = 'years'::regclass
  ) THEN
    ALTER TABLE years
      ADD CONSTRAINT years_user_id_year_number_key
      UNIQUE (user_id, year_number);
  END IF;
END $$;
