-- chip_task_notes
-- Stores task-panel notes for chip-task rows.
--
-- Chip tasks have ephemeral planner_row UUIDs (new UUID on every saveTaskRows
-- cycle due to the DELETE+bulk-INSERT pattern), so notes cannot be keyed by
-- planner_row.id. The chip_id (the tactics chip UUID) is stable for the
-- lifetime of the chip and is used as the join key here.
--
-- Previously stored in localStorage under 'listical-chip-note-<chipId>'.
-- Existing localStorage values are migrated to this table on first load by
-- preloadChipTaskNotes() in src/utils/planner/storage.js.

CREATE TABLE IF NOT EXISTS chip_task_notes (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chip_id     text        NOT NULL,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chip_id)
);

-- Index for the common single-user fetch used by preloadChipTaskNotes.
CREATE INDEX IF NOT EXISTS chip_task_notes_user_id_idx
  ON chip_task_notes (user_id);

-- RLS
ALTER TABLE chip_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own chip notes"
  ON chip_task_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chip notes"
  ON chip_task_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chip notes"
  ON chip_task_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chip notes"
  ON chip_task_notes FOR DELETE
  USING (auth.uid() = user_id);
