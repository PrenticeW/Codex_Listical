-- Add date_of_birth column to profiles table for age verification
-- This migration adds COPPA compliance (must be 13+ to use Listical)

-- Add date_of_birth column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN date_of_birth date;
  END IF;
END $$;

-- Create function to validate age is 13 or older
CREATE OR REPLACE FUNCTION public.validate_age_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if date_of_birth is provided
  IF NEW.date_of_birth IS NOT NULL THEN
    -- Check if user is at least 13 years old
    IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '13 years') THEN
      RAISE EXCEPTION 'User must be at least 13 years old to use Listical';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS validate_age_on_profile ON public.profiles;

-- Create trigger to validate age on insert and update
CREATE TRIGGER validate_age_on_profile
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_age_requirement();

-- Add a check constraint as additional protection
-- This provides database-level enforcement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_age_requirement'
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_age_requirement
    CHECK (date_of_birth IS NULL OR date_of_birth <= (CURRENT_DATE - INTERVAL '13 years'));
  END IF;
END $$;

-- Update the handle_new_user function to include date_of_birth from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, date_of_birth)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    (new.raw_user_meta_data->>'date_of_birth')::date
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.profiles.date_of_birth IS 'User date of birth for age verification (COPPA compliance - must be 13+)';
