-- Task-row project_id backfill + project guard.
--
-- Incident (2026-09-04, ~09:36 BST): 20 task rows lost their project (and
-- most their subproject) in one burst of per-row writes from the mobile app.
-- Root cause: task rows created on the web carried the project ONLY as the
-- day_entries.__project nickname (project_id = NULL — the web never stamped
-- it on task rows), while mobile's reorder save treated project_id = NULL as
-- "no project" and wrote __project = '' / subproject_label = '' for every
-- Inbox task on every reorder. Both clients are fixed in code
-- (tacular-mobile persistReorder/flattenNested; web useEditState now stamps
-- projectId on project-cell edits). This migration:
--
--   1. Backfills project_id on existing task rows from the __project
--      nickname, so mobile's project_id-first logic sees the project.
--   2. Adds a guard trigger: an UPDATE that arrives with __project blank
--      (or missing) while the stored row has one, WITHOUT also changing
--      project_id, keeps the stored nickname. A deliberate clear from the
--      web sets the cell to '-' before saving '' — that still clears because
--      the web also nulls project_id in the same write (useEditState).
--      Same rule for subproject_label. Service-role / SQL-editor writes are
--      never gated.

-- ---------- 1. Backfill ----------
UPDATE public.planner_rows r
SET project_id = p.id
FROM public.projects p
WHERE r.project_id IS NULL
  AND r.row_kind = 'task'
  AND COALESCE(r.day_entries->>'__project', '') <> ''
  AND p.user_id = r.user_id
  AND p.year_id = r.year_id
  AND (
    NULLIF(btrim(p.project_nickname), '') = r.day_entries->>'__project'
    OR (NULLIF(btrim(p.project_nickname), '') IS NULL
        AND btrim(p.project_name) = r.day_entries->>'__project')
  );

-- ---------- 2. Guard trigger ----------
CREATE OR REPLACE FUNCTION public.planner_rows_keep_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_project text := COALESCE(OLD.day_entries->>'__project', '');
  new_project text := COALESCE(NEW.day_entries->>'__project', '');
  project_id_changed boolean := (OLD.project_id IS DISTINCT FROM NEW.project_id);
BEGIN
  IF pg_has_role(current_user, 'service_role', 'member')
     OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Blanking the display nickname without touching project_id is never a
  -- deliberate clear (a clear also nulls project_id): keep the stored value.
  IF old_project <> '' AND new_project = '' AND NOT project_id_changed THEN
    NEW.day_entries := jsonb_set(COALESCE(NEW.day_entries, '{}'::jsonb), '{__project}', to_jsonb(old_project));
    -- A subproject blanked in the same write is part of the same mistake.
    IF COALESCE(OLD.subproject_label, '') <> '' AND COALESCE(NEW.subproject_label, '') = '' THEN
      NEW.subproject_label := OLD.subproject_label;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_rows_keep_project ON public.planner_rows;
CREATE TRIGGER planner_rows_keep_project
  BEFORE UPDATE ON public.planner_rows
  FOR EACH ROW EXECUTE FUNCTION public.planner_rows_keep_project();
