-- Tenant-specific override of the plan's standard price. NULL (the default,
-- and every existing row) means "use the standard plan price" — fully
-- backward compatible, no plan/global pricing touched.
ALTER TABLE public.subscriptions
  ADD COLUMN custom_price_paise bigint NULL;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_custom_price_paise_nonneg
  CHECK (custom_price_paise IS NULL OR custom_price_paise >= 0);

COMMENT ON COLUMN public.subscriptions.custom_price_paise IS
  'Super-Admin-set tenant-specific override of plans.price_paise. NULL = use the standard plan price. Never modifies the shared plan row.';

-- MRR must use the *effective* price (custom override if set, else the plan's
-- standard price) for ACTIVE subscriptions, normalized by the same
-- MONTHLY/QUARTERLY/YEARLY/WEEKLY logic as before. Active-subscriptions
-- count, churn, and tenants-by-status are untouched.
CREATE OR REPLACE FUNCTION public.fn_get_platform_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mrr BIGINT := 0;
  v_active INT := 0;
  v_tenants_by_status JSONB;
  v_churn NUMERIC := 0;
  v_cancelled_30 INT := 0;
  v_total_end INT := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN may read platform metrics';
  END IF;

  SELECT COALESCE(SUM(
    CASE UPPER(COALESCE(p.billing_interval,'MONTHLY'))
      WHEN 'YEARLY' THEN COALESCE(s.custom_price_paise, p.price_paise) / 12
      WHEN 'QUARTERLY' THEN COALESCE(s.custom_price_paise, p.price_paise) / 3
      WHEN 'WEEKLY' THEN COALESCE(s.custom_price_paise, p.price_paise) * 4
      ELSE COALESCE(s.custom_price_paise, p.price_paise)
    END
  ),0)
    INTO v_mrr
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.status = 'ACTIVE';

  SELECT COUNT(*) INTO v_active FROM public.subscriptions WHERE status = 'ACTIVE';

  SELECT jsonb_object_agg(status, cnt) INTO v_tenants_by_status
  FROM (SELECT status, COUNT(*) AS cnt FROM public.tenants GROUP BY status) t;

  SELECT COUNT(*) INTO v_cancelled_30 FROM public.subscriptions
    WHERE status = 'CANCELLED' AND cancelled_at >= now() - interval '30 days';
  SELECT COUNT(*) INTO v_total_end FROM public.subscriptions
    WHERE created_at <= now() - interval '30 days';
  IF v_total_end > 0 THEN v_churn := v_cancelled_30::numeric / v_total_end; END IF;

  RETURN jsonb_build_object(
    'mrr_paise', v_mrr,
    'active_subscriptions', v_active,
    'tenants_by_status', COALESCE(v_tenants_by_status, '{}'::jsonb),
    'churn_30d', v_churn
  );
END $function$;
