-- =========================================================================
-- Rate limiting for GDPR data exports (Art. 15 / Art. 20)
--
-- Mirrors the account-deletion rate limiting in 20260120000003: a small
-- service-role-only bookkeeping table plus check/record functions, limited
-- to 3 export attempts per hour per user.
--
-- Erasure coverage: export_rate_limits has a user_id FK with ON DELETE
-- CASCADE, and count_remaining_user_data (20260801000001) discovers it
-- dynamically at verification time, so the deletion flow can never be
-- marked 'completed' while rows survive here. Like deletion_rate_limits,
-- this table is internal bookkeeping and is NOT part of the data export
-- itself.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.export_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_rate_limits_user_time
  ON public.export_rate_limits(user_id, attempted_at DESC);

ALTER TABLE public.export_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the service role touches rate limit data
CREATE POLICY "Service role can manage export rate limits"
  ON public.export_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Returns true if the user is allowed another export (under 3 in the last hour)
CREATE OR REPLACE FUNCTION public.check_export_rate_limit(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO attempt_count
  FROM public.export_rate_limits
  WHERE user_id = target_user_id
  AND attempted_at > NOW() - INTERVAL '1 hour';

  RETURN attempt_count < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Records an export attempt and prunes entries older than 24 hours
CREATE OR REPLACE FUNCTION public.record_export_attempt(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.export_rate_limits (user_id, attempted_at)
  VALUES (target_user_id, NOW());

  DELETE FROM public.export_rate_limits
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.check_export_rate_limit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_export_rate_limit(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.record_export_attempt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_export_attempt(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_export_rate_limit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_export_attempt(UUID) TO service_role;

COMMENT ON TABLE public.export_rate_limits IS 'Tracks data export attempts for rate limiting (3 per hour per user)';
COMMENT ON FUNCTION public.check_export_rate_limit IS 'Returns true if user has not exceeded 3 export attempts in the last hour';
COMMENT ON FUNCTION public.record_export_attempt IS 'Records a data export attempt and cleans up old entries';
