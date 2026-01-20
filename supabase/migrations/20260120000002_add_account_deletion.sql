-- Add account deletion support for GDPR/privacy compliance
-- Allows users to request account deletion with audit trail

-- Enable pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add deletion tracking columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'deletion_requested_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deletion_requested_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create enum type for deletion status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deletion_status') THEN
    CREATE TYPE deletion_status AS ENUM ('pending', 'completed', 'failed');
  END IF;
END $$;

-- Create deletion audit log table
-- Stores hashed user_id for audit trail without retaining PII
CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status deletion_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying audit logs by status
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_status ON public.deletion_audit_log(status);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_requested_at ON public.deletion_audit_log(requested_at);

-- Add updated_at trigger for deletion_audit_log
DROP TRIGGER IF EXISTS update_deletion_audit_log_updated_at ON public.deletion_audit_log;
CREATE TRIGGER update_deletion_audit_log_updated_at
  BEFORE UPDATE ON public.deletion_audit_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create SHA-256 hash of user_id for audit purposes
CREATE OR REPLACE FUNCTION public.hash_user_id(user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(user_id::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to request account deletion
-- Sets the deletion_requested_at timestamp and creates audit log entry
CREATE OR REPLACE FUNCTION public.request_account_deletion(target_user_id UUID)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  -- Update the profile to mark deletion requested
  UPDATE public.profiles
  SET deletion_requested_at = NOW()
  WHERE id = target_user_id
  AND deletion_requested_at IS NULL
  AND deleted_at IS NULL;

  -- Create audit log entry with hashed user_id
  INSERT INTO public.deletion_audit_log (user_id_hash, requested_at, status)
  VALUES (public.hash_user_id(target_user_id), NOW(), 'pending')
  RETURNING id INTO audit_id;

  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete account deletion
-- Marks the deletion as completed in both profile and audit log
CREATE OR REPLACE FUNCTION public.complete_account_deletion(target_user_id UUID, audit_log_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mark profile as deleted
  UPDATE public.profiles
  SET deleted_at = NOW()
  WHERE id = target_user_id
  AND deletion_requested_at IS NOT NULL
  AND deleted_at IS NULL;

  -- Update audit log
  UPDATE public.deletion_audit_log
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = audit_log_id
  AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark deletion as failed
CREATE OR REPLACE FUNCTION public.fail_account_deletion(audit_log_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.deletion_audit_log
  SET status = 'failed'
  WHERE id = audit_log_id
  AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on deletion_audit_log
ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs (no user access to audit data)
CREATE POLICY "Service role can manage deletion audit logs"
  ON public.deletion_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON COLUMN public.profiles.deletion_requested_at IS 'Timestamp when user requested account deletion';
COMMENT ON COLUMN public.profiles.deleted_at IS 'Timestamp when account was actually deleted';
COMMENT ON TABLE public.deletion_audit_log IS 'Audit trail for account deletions with hashed user IDs for privacy compliance';
COMMENT ON COLUMN public.deletion_audit_log.user_id_hash IS 'SHA-256 hash of user UUID - provides audit trail without storing PII';
COMMENT ON FUNCTION public.hash_user_id IS 'Creates SHA-256 hash of user UUID for audit purposes';
COMMENT ON FUNCTION public.request_account_deletion IS 'Initiates account deletion process and creates audit log entry';
COMMENT ON FUNCTION public.complete_account_deletion IS 'Marks account deletion as completed';
COMMENT ON FUNCTION public.fail_account_deletion IS 'Marks account deletion as failed';
