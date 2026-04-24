-- Bump age floor from 13 to 16 for GDPR-K compliance (EU default).
--
-- Context: The initial age migration (20260120000001_add_age_verification.sql)
-- set the floor at 13 under the assumption of COPPA (US) compliance. First
-- clients are UK and Europe, so the operative framework is GDPR-K, whose
-- default age of consent is 16. Picking a single floor across member states
-- keeps enforcement simple; 16 is accepted by every EU jurisdiction and is
-- valid in the UK (DPA 2018 sets 13 as a minimum, no maximum).
--
-- Changes:
--   1. validate_age_requirement() now uses INTERVAL '16 years' and rejects
--      rows where date_of_birth IS NULL (closes an API-level bypass: the
--      previous trigger and CHECK both allowed NULL).
--   2. profiles_age_requirement CHECK constraint dropped and re-added at 16,
--      also disallowing NULL.
--   3. Column COMMENT updated to reference GDPR-K instead of COPPA.
--
-- Safety: At time of authoring there are no production accounts, only test
-- accounts, and none fall in the 13-to-16 range. If any later existed they
-- would need to be deleted or have DOB corrected before this migration ran.

-- 0. Preflight: fail fast with a clear message if any existing profile row
--    would violate the new rules (NULL DOB, or DOB under 16). The old
--    constraint allowed both; the new one does not. Keep this check before
--    any schema changes so the migration is effectively atomic.
DO $$
DECLARE
  offending_count integer;
BEGIN
  SELECT COUNT(*) INTO offending_count
  FROM public.profiles
  WHERE date_of_birth IS NULL
     OR date_of_birth > (CURRENT_DATE - INTERVAL '16 years');

  IF offending_count > 0 THEN
    RAISE EXCEPTION
      'Cannot bump age floor to 16: % profile row(s) have NULL or under-16 date_of_birth. '
      'Delete or correct these rows before re-running this migration.',
      offending_count;
  END IF;
END $$;

-- 1. Replace the age-validation trigger function.
CREATE OR REPLACE FUNCTION public.validate_age_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- A DOB is now mandatory; refuse rows that try to skip the check.
  IF NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'date_of_birth is required for all profiles';
  END IF;

  -- Reject anyone under 16 (GDPR-K default age of consent).
  IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '16 years') THEN
    RAISE EXCEPTION 'User must be at least 16 years old to use Listical';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger itself is unchanged (still fires BEFORE INSERT OR UPDATE on
-- public.profiles), so no need to drop/recreate it.

-- 2. Swap the CHECK constraint from 13 to 16 and disallow NULL.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_age_requirement;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_requirement
  CHECK (
    date_of_birth IS NOT NULL
    AND date_of_birth <= (CURRENT_DATE - INTERVAL '16 years')
  );

-- 3. Update the column comment.
COMMENT ON COLUMN public.profiles.date_of_birth IS
  'User date of birth for age verification (GDPR-K compliance, must be 16+). Mandatory.';
