
-- =========== plan_features ===========
CREATE TABLE public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  limit_value BIGINT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);
GRANT SELECT ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_features_read_auth" ON public.plan_features
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_plan_features_updated_at BEFORE UPDATE ON public.plan_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== tenant_feature_overrides ===========
CREATE TABLE public.tenant_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  limit_value BIGINT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_feature_overrides TO authenticated;
GRANT ALL ON public.tenant_feature_overrides TO service_role;
ALTER TABLE public.tenant_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_role_assignments
    WHERE user_id = _user_id AND is_active = true AND role = 'SUPER_ADMIN');
$$;

CREATE POLICY "tfo_super_all" ON public.tenant_feature_overrides
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "tfo_admin_read" ON public.tenant_feature_overrides
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));
CREATE TRIGGER trg_tfo_updated_at BEFORE UPDATE ON public.tenant_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== support_sessions ===========
CREATE TABLE public.support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  super_admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  support_reference TEXT,
  consent_recorded BOOLEAN NOT NULL DEFAULT false,
  access_mode TEXT NOT NULL CHECK (access_mode IN ('READ_ONLY','STANDARD','ELEVATED')),
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_user_id <> super_admin_user_id),
  CHECK (expires_at <= started_at + interval '60 minutes')
);
GRANT SELECT, INSERT, UPDATE ON public.support_sessions TO authenticated;
GRANT ALL ON public.support_sessions TO service_role;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_super_all" ON public.support_sessions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Target user AND their tenant's Hostel Admins can read (for transparency banner + audit)
CREATE POLICY "support_target_read" ON public.support_sessions
  FOR SELECT TO authenticated
  USING (
    target_user_id = auth.uid()
    OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
  );

CREATE INDEX idx_support_sessions_target_active ON public.support_sessions(target_user_id, expires_at)
  WHERE ended_at IS NULL;
CREATE INDEX idx_support_sessions_tenant ON public.support_sessions(tenant_id);

-- =========== fn_get_platform_metrics ===========
CREATE OR REPLACE FUNCTION public.fn_get_platform_metrics()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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

  -- MRR: normalize plan price to monthly (billing_interval assumed 'MONTHLY'|'QUARTERLY'|'YEARLY')
  SELECT COALESCE(SUM(
    CASE UPPER(COALESCE(p.billing_interval,'MONTHLY'))
      WHEN 'YEARLY' THEN p.price_paise / 12
      WHEN 'QUARTERLY' THEN p.price_paise / 3
      WHEN 'WEEKLY' THEN p.price_paise * 4
      ELSE p.price_paise
    END
  ),0), COUNT(*)
    INTO v_mrr, v_active
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.status IN ('ACTIVE','TRIALING');

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
END $$;

REVOKE ALL ON FUNCTION public.fn_get_platform_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_platform_metrics() TO authenticated;

-- =========== fn_effective_feature ===========
CREATE OR REPLACE FUNCTION public.fn_effective_feature(_tenant_id UUID, _feature_key TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row JSONB;
BEGIN
  SELECT jsonb_build_object('enabled',enabled,'limit_value',limit_value,'configuration',configuration,'source','override')
    INTO v_row
  FROM public.tenant_feature_overrides
  WHERE tenant_id = _tenant_id AND feature_key = _feature_key
    AND (expires_at IS NULL OR expires_at > now());
  IF v_row IS NOT NULL THEN RETURN v_row; END IF;
  SELECT jsonb_build_object('enabled',pf.enabled,'limit_value',pf.limit_value,'configuration',pf.configuration,'source','plan')
    INTO v_row
  FROM public.subscriptions s
  JOIN public.plan_features pf ON pf.plan_id = s.plan_id
  WHERE s.tenant_id = _tenant_id AND s.status IN ('ACTIVE','TRIALING')
    AND pf.feature_key = _feature_key
  LIMIT 1;
  RETURN COALESCE(v_row, jsonb_build_object('enabled',false,'source','default'));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_effective_feature(UUID,TEXT) TO authenticated;

-- =========== fn_end_support_session ===========
CREATE OR REPLACE FUNCTION public.fn_end_support_session(_session_id UUID, _reason TEXT)
RETURNS public.support_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.support_sessions;
BEGIN
  SELECT * INTO v_row FROM public.support_sessions WHERE id = _session_id FOR UPDATE;
  IF v_row IS NULL THEN RAISE EXCEPTION 'session not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR v_row.target_user_id = auth.uid()
          OR public.has_tenant_role(auth.uid(), v_row.tenant_id, 'HOSTEL_ADMIN'::app_role)) THEN
    RAISE EXCEPTION 'not authorized to end session';
  END IF;
  UPDATE public.support_sessions
    SET ended_at = COALESCE(ended_at, now()), ended_reason = COALESCE(ended_reason, _reason)
    WHERE id = _session_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_end_support_session(UUID,TEXT) TO authenticated;
