-- Add updated_at to planner_rows, maintained by a BEFORE UPDATE trigger.
--
-- Phase 3 of docs/offline-sync-plan.md (the timestamp-guard prerequisite).
-- INERT to all current clients: nothing reads or writes this column yet, and
-- the trigger fires server-side on every UPDATE regardless of who sends it
-- (web diff-save, mobile outbox, SQL editor). It exists so a future replay
-- guard can add `WHERE updated_at <= <queued_at>` to offline patches,
-- letting a genuinely old offline edit lose to a newer online one instead of
-- plain last-write-wins. Do NOT add that guard client-side without also
-- deciding the drop-vs-surface behaviour for the rejected op.

ALTER TABLE public.planner_rows
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_planner_rows_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_rows_set_updated_at ON public.planner_rows;
CREATE TRIGGER planner_rows_set_updated_at
  BEFORE UPDATE ON public.planner_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_planner_rows_updated_at();

-- Backfill: rows never updated since the column landed read as "updated at
-- migration time", which is the most conservative value available (a replay
-- guard comparing against it errs toward keeping the newer-looking server
-- row rather than overwriting it with a stale offline edit).
