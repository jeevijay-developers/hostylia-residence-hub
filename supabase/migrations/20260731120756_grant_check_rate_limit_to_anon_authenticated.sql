-- sendPhoneOtp calls check_rate_limit using the publishable (anon) key client
-- (OTP send happens before the caller is authenticated) — EXECUTE was only
-- granted to service_role, so every anon-context call failed with
-- "permission denied for function check_rate_limit". Safe to open up:
-- SECURITY DEFINER, only touches rate_limits with a caller-supplied bucket key.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
