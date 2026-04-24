-- Add 'draft' to the years.status CHECK constraint.
--
-- Context: the app already treats 'draft' as a first-class year status
-- (the "Plan Next Year" flow creates a draft year that is edited alongside
-- the active year, then promoted to active via archive). The database schema
-- authored in 20260102000001_initial_schema.sql pre-dates that flow and only
-- permits 'active' and 'archived'. This migration aligns the schema with the
-- app so draft-year rows can be written once planning data moves off
-- localStorage and into Supabase.
--
-- Safety: the new CHECK is a strict superset of the old one (adds 'draft',
-- removes nothing). No existing rows can become invalid, so no data backfill
-- or pre-flight audit is required.

ALTER TABLE public.years DROP CONSTRAINT IF EXISTS years_status_check;

ALTER TABLE public.years ADD CONSTRAINT years_status_check
  CHECK (status IN ('active', 'draft', 'archived'));

COMMENT ON CONSTRAINT years_status_check ON public.years IS
  'Allowed year statuses: active (current working year), draft (next year being planned but not yet started), archived (completed year, read-only)';
