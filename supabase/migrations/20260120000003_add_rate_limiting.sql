-- Add rate limiting for account deletion attempts
-- Prevents abuse by limiting to 3 attempts per hour per user

-- Create rate limiting table for deletion attempts
CREATE TABLE IF NOT EXISTS public.deletion_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient rate limit lookups
CREATE INDEX IF NOT EXISTS idx_deletion_rate_limits_user_time
  ON public.deletion_rate_limits(user_id, attempted_at DESC);

-- Enable RLS
ALTER TABLE public.deletion_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limit data
CREATE POLICY "Service role can manage deletion rate limits"
  ON public.deletion_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check rate limit (returns true if allowed, false if rate limited)
CREATE OR REPLACE FUNCTION public.check_deletion_rate_limit(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  -- Count attempts in the last hour
  SELECT COUNT(*) INTO attempt_count
  FROM public.deletion_rate_limits
  WHERE user_id = target_user_id
  AND attempted_at > NOW() - INTERVAL '1 hour';

  -- Allow if under 3 attempts
  RETURN attempt_count < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record a deletion attempt
CREATE OR REPLACE FUNCTION public.record_deletion_attempt(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.deletion_rate_limits (user_id, attempted_at)
  VALUES (target_user_id, NOW());

  -- Clean up old entries (older than 24 hours) to prevent table bloat
  DELETE FROM public.deletion_rate_limits
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE public.deletion_rate_limits IS 'Tracks account deletion attempts for rate limiting';
COMMENT ON FUNCTION public.check_deletion_rate_limit IS 'Returns true if user has not exceeded 3 deletion attempts in the last hour';
COMMENT ON FUNCTION public.record_deletion_attempt IS 'Records a deletion attempt and cleans up old entries';
