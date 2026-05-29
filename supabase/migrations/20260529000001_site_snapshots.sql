-- =========================================================================
-- Version History: replace planning_history with site_snapshots
--
-- planning_history was a trigger-based row-level history table. The version
-- history plan (VERSION_HISTORY_PLAN.md) replaced that approach with
-- whole-site snapshots. This migration:
--   1. Drops planning_history (was never populated in production).
--   2. Creates site_snapshots with goal / plan / system JSONB bundles.
--   3. Adds an RLS policy so users can only read and write their own rows.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Drop the old trigger-based table
-- -------------------------------------------------------------------------
DROP TABLE IF EXISTS planning_history CASCADE;

-- -------------------------------------------------------------------------
-- 2. Create site_snapshots
-- -------------------------------------------------------------------------
CREATE TABLE site_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_number  INTEGER NOT NULL,
  goal         JSONB NOT NULL DEFAULT '{}',
  plan         JSONB NOT NULL DEFAULT '{}',
  system       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the two read patterns:
--   1. Load all snapshots for a user + year (history panel list).
--   2. Check the most-recent snapshot's created_at (debounce guard).
CREATE INDEX idx_site_snapshots_lookup
  ON site_snapshots (user_id, year_number, created_at DESC);

-- -------------------------------------------------------------------------
-- 3. Row-level security
-- -------------------------------------------------------------------------
ALTER TABLE site_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own snapshots.
CREATE POLICY "Users can read own snapshots"
  ON site_snapshots FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own snapshots.
CREATE POLICY "Users can insert own snapshots"
  ON site_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own snapshots (needed for the 50-row cap cleanup).
CREATE POLICY "Users can delete own snapshots"
  ON site_snapshots FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================================================
-- End of migration
-- =========================================================================
