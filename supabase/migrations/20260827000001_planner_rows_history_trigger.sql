-- planner_rows → planning_history triggers (VERSION_HISTORY_PLAN.md step 2)
--
-- Why now: the website's version history (snapshotStorage) is entirely
-- client-side and only runs inside an open web tab. Days of edits made from
-- the mobile app produced no restore point at all, so when a stale web tab
-- overwrote them on 2026-08-27 there was nothing to roll back to. These
-- triggers capture the PREVIOUS version of every planner_rows UPDATE and
-- DELETE at the database, regardless of which client sent the write.
--
-- Storage: previous_data holds the whole old row as JSONB. A row is written
-- only when something other than updated_at actually changed, so the
-- diff-save's no-op upserts and the updated_at trigger itself do not spam
-- the table. Retention is pruned to 30 days per user on every insert via a
-- cheap statement-level trigger (see below); adjust HISTORY_RETENTION_DAYS
-- if the product decision changes.
--
-- Reads: nothing in the clients reads planning_history yet. A restore
-- helper (pick a timestamp, rebuild the row set as of then) is the next
-- step — see docs/known-issues.md.

-- The table was declared in 20260516000001_planning_schema.sql (Section 12)
-- but is missing from the live database (applying this migration failed
-- with 42P01 on 2026-08-27), so create it here if needed. Definition,
-- index and RLS policy match the originals exactly.
CREATE TABLE IF NOT EXISTS public.planning_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name     TEXT NOT NULL,
  row_id         UUID NOT NULL,
  previous_data  JSONB NOT NULL,
  operation      TEXT NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_history_lookup
  ON public.planning_history (user_id, table_name, row_id, changed_at DESC);

ALTER TABLE public.planning_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_history_select ON public.planning_history;
CREATE POLICY planning_history_select ON public.planning_history
  FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.planner_rows_write_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Skip no-op writes (same content, only updated_at touched).
    IF (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.planning_history (user_id, table_name, row_id, previous_data, operation)
    VALUES (OLD.user_id, 'planner_rows', OLD.id, to_jsonb(OLD), 'UPDATE');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.planning_history (user_id, table_name, row_id, previous_data, operation)
    VALUES (OLD.user_id, 'planner_rows', OLD.id, to_jsonb(OLD), 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_planner_rows_history ON public.planner_rows;
CREATE TRIGGER trg_planner_rows_history
  AFTER UPDATE OR DELETE ON public.planner_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.planner_rows_write_history();

-- Retention: prune this user's history older than 30 days. Runs once per
-- statement that inserts into planning_history, so bulk saves cost one
-- DELETE, not one per row.
CREATE OR REPLACE FUNCTION public.planning_history_prune()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  HISTORY_RETENTION_DAYS CONSTANT integer := 30;
BEGIN
  DELETE FROM public.planning_history h
  USING (SELECT DISTINCT user_id FROM new_rows) n
  WHERE h.user_id = n.user_id
    AND h.changed_at < now() - make_interval(days => HISTORY_RETENTION_DAYS);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_planning_history_prune ON public.planning_history;
CREATE TRIGGER trg_planning_history_prune
  AFTER INSERT ON public.planning_history
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.planning_history_prune();

-- RLS: planning_history_select (above) limits reads to the owner. The
-- trigger functions are SECURITY DEFINER so they can insert/prune
-- regardless of the caller's policies.
