-- Minimal schema for cancellation feedback — no existing structure covered
-- this (subscriptions.cancelled_at already existed for the timestamp, but
-- there was nowhere to store reason/feedback). tenant_id + subscription_id
-- both kept (not just subscription_id) so RLS can scope by tenant_id
-- directly, matching every other tenant-owned table's pattern, without an
-- extra join through subscriptions on every read.
CREATE TABLE public.subscription_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cancellation_reason text NOT NULL CHECK (cancellation_reason IN (
    'TOO_EXPENSIVE','MISSING_FEATURES','DIFFICULT_TO_USE','PERFORMANCE_ISSUE',
    'SWITCHING_SOLUTION','BUSINESS_CLOSED','TEMPORARY_REQUIREMENT','OTHER'
  )),
  cancellation_reason_other text,
  continue_in_future boolean,
  additional_feedback text,
  cancelled_by uuid NOT NULL REFERENCES public.profiles(id),
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscription_cancellations_tenant_idx ON public.subscription_cancellations(tenant_id);
CREATE INDEX subscription_cancellations_subscription_idx ON public.subscription_cancellations(subscription_id);
CREATE INDEX subscription_cancellations_cancelled_at_idx ON public.subscription_cancellations(cancelled_at);

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_cancellations FORCE ROW LEVEL SECURITY;

-- Same shape as subscriptions_select_admin: Super Admin sees all, a tenant's
-- own Hostel Admin sees only their tenant's rows. No INSERT/UPDATE/DELETE
-- policy for `authenticated` at all — writes only happen inside
-- fn_cancel_own_subscription (SECURITY DEFINER), the same "no direct client
-- write" pattern audit_logs already uses.
CREATE POLICY subscription_cancellations_select_scoped ON public.subscription_cancellations
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
);

-- Hostel-Admin-only self-service cancellation of their own tenant's ACTIVE
-- subscription. All authorization happens inside the function (hard DB-layer
-- gate), not just app-layer — same pattern as fn_assign_hostel_admin. Only
-- an ACTIVE subscription can be cancelled this way (a TRIAL ending is not a
-- cancellation); the subscriptions_write_super RLS policy is untouched, this
-- function bypasses it deliberately and only for this one narrow write.
CREATE OR REPLACE FUNCTION public.fn_cancel_own_subscription(
  p_tenant_id uuid,
  p_cancellation_reason text,
  p_cancellation_reason_other text DEFAULT NULL,
  p_continue_in_future boolean DEFAULT NULL,
  p_additional_feedback text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT public.has_tenant_role(auth.uid(), p_tenant_id, 'HOSTEL_ADMIN'::app_role) THEN
    RAISE EXCEPTION 'Only a Hostel Admin of this tenant may cancel its subscription';
  END IF;

  IF p_cancellation_reason NOT IN (
    'TOO_EXPENSIVE','MISSING_FEATURES','DIFFICULT_TO_USE','PERFORMANCE_ISSUE',
    'SWITCHING_SOLUTION','BUSINESS_CLOSED','TEMPORARY_REQUIREMENT','OTHER'
  ) THEN
    RAISE EXCEPTION 'Invalid cancellation reason';
  END IF;

  SELECT id INTO v_sub_id FROM public.subscriptions
  WHERE tenant_id = p_tenant_id AND status = 'ACTIVE'
  ORDER BY created_at DESC LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription found for this tenant';
  END IF;

  UPDATE public.subscriptions
  SET status = 'CANCELLED', cancelled_at = v_now
  WHERE id = v_sub_id;

  INSERT INTO public.subscription_cancellations (
    subscription_id, tenant_id, cancellation_reason, cancellation_reason_other,
    continue_in_future, additional_feedback, cancelled_by, cancelled_at
  ) VALUES (
    v_sub_id, p_tenant_id, p_cancellation_reason, p_cancellation_reason_other,
    p_continue_in_future, p_additional_feedback, auth.uid(), v_now
  );

  INSERT INTO public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, auth.uid(), 'SUBSCRIPTION_CANCELLED_BY_HOSTEL_ADMIN', 'subscriptions', v_sub_id,
    jsonb_build_object(
      'cancellation_reason', p_cancellation_reason,
      'continue_in_future', p_continue_in_future
    )
  );

  RETURN jsonb_build_object('subscription_id', v_sub_id, 'cancelled_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cancel_own_subscription(uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cancel_own_subscription(uuid, text, text, boolean, text) TO authenticated;

-- 30-day churn: add the raw churned-tenant count alongside the existing,
-- unchanged churn_30d percentage (v_cancelled_30 was already computed for
-- the percentage — this just also returns it, no formula change).
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
    'churn_30d', v_churn,
    'churned_count_30d', v_cancelled_30
  );
END $function$;
