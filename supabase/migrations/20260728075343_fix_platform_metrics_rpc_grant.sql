-- fn_get_platform_metrics() is a client-facing RPC called directly by the
-- Super Admin dashboard (supabase.rpc from the authenticated browser session).
-- It enforces its own authorization internally (SECURITY DEFINER + is_super_admin
-- check), same pattern as other client RPCs. The 20260717112956 migration's
-- internal-fn hardening pass mistakenly swept it in as an "internal trigger/cron"
-- function and revoked authenticated EXECUTE, which broke the dashboard KPIs
-- (silently failing RPC calls made totals render as 0).
GRANT EXECUTE ON FUNCTION public.fn_get_platform_metrics() TO authenticated;
