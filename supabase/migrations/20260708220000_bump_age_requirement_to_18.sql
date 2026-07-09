-- Bump age floor from 16 to 18.
--
-- Context: the previous floor (20260425000001_bump_age_requirement_to_16.sql)
-- set 16 as the GDPR-K default age of digital consent, valid across every EU
-- member state and the UK. Product decision: move the floor to 18 for
-- broader legal-adult coverage rather than the GDPR-K minimum.
--
-- Changes:
--   1. validate_age_requirement() now uses INTERVAL '18 years'.
--   2. profiles_age_requirement CHECK constraint dropped and re-added at 18.
--   3. Column COMMENT updated to reference the 18+ floor.
--
-- Safety: preflight check below fails fast if any existing profile row
-- (NULL DOB, or DOB indicating 16 or 17 years old) would violate the new
-- constraint. Delete or correct those rows before re-running this migration.

-- 0. Preflight: fail fast with a clear message if any existing profile row
--    would violate the new rules (NULL DOB, or DOB under 18). Keep this
--    check before any schema changes so the migration is effectively atomic.
DO $$
DECLARE
  offending_count integer;
BEGIN
  SELECT COUNT(*) INTO offending_count
  FROM public.profiles
  WHERE date_of_birth IS NULL
     OR date_of_birth > (CURRENT_DATE - INTERVAL '18 years');

  IF offending_count > 0 THEN
    RAISE EXCEPTION
      'Cannot bump age floor to 18: % profile row(s) have NULL or under-18 date_of_birth. '
      'Delete or correct these rows before re-running this migration.',
      offending_count;
  END IF;
END $$;

-- 1. Replace the age-validation trigger function.
CREATE OR REPLACE FUNCTION public.validate_age_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- A DOB is mandatory; refuse rows that try to skip the check.
  IF NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'date_of_birth is required for all profiles';
  END IF;

  -- Reject anyone under 18.
  IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'User must be at least 18 years old to use Tacular';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger itself is unchanged (still fires BEFORE INSERT OR UPDATE on
-- public.profiles), so no need to drop/recreate it.

-- 2. Swap the CHECK constraint from 16 to 18.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_age_requirement;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_requirement
  CHECK (
    date_of_birth IS NOT NULL
    AND date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')
  );

-- 3. Update the column comment.
COMMENT ON COLUMN public.profiles.date_of_birth IS
  'User date of birth for age verification, must be 18+. Mandatory.';
