
-- Enable citext for case-insensitive slug/email columns
CREATE EXTENSION IF NOT EXISTS citext;

-- =====================================================================
-- Drop placeholder tables in dependency order (no data yet)
-- =====================================================================
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.rate_limits CASCADE;

-- =====================================================================
-- tenants
-- =====================================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug CITEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  status TEXT NOT NULL DEFAULT 'TRIAL'
    CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')),
  default_locale TEXT NOT NULL DEFAULT 'en',
  default_currency CHAR(3) NOT NULL DEFAULT 'INR'
    CHECK (default_currency = upper(default_currency)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  onboarding_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (onboarding_status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CHECK (slug = lower(btrim(slug::text)))
);
CREATE INDEX idx_tenants_status ON public.tenants(status);
CREATE INDEX idx_tenants_created_at ON public.tenants(created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_tenants_all_authenticated" ON public.tenants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- organizations
-- =====================================================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  gstin TEXT,
  pan_last4 TEXT CHECK (pan_last4 IS NULL OR pan_last4 ~ '^[A-Z0-9]{4}$'),
  billing_email CITEXT,
  billing_phone TEXT,
  registered_address JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uniq_organizations_tenant_name_active
  ON public.organizations(tenant_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_tenant ON public.organizations(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_orgs_all_authenticated" ON public.organizations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- properties
-- =====================================================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug CITEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'HOSTEL'
    CHECK (property_type IN ('HOSTEL','PG','DORMITORY','COACHING_HOSTEL')),
  gender_policy TEXT NOT NULL DEFAULT 'COED'
    CHECK (gender_policy IN ('MALE','FEMALE','COED','CUSTOM')),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','SUSPENDED')),
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  landmark TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'IN',
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  phone TEXT,
  email CITEXT,
  logo_path TEXT,
  brand_primary_color TEXT,
  brand_secondary_color TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uniq_properties_tenant_slug_active
  ON public.properties(tenant_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_tenant ON public.properties(tenant_id);
CREATE INDEX idx_properties_org ON public.properties(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_properties_all_authenticated" ON public.properties
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- profiles  (id = auth.users.id, cascade delete)
-- =====================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  preferred_name TEXT,
  phone TEXT,
  email CITEXT,
  avatar_path TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INVITED','SUSPENDED','DISABLED')),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_profiles_self_all" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- plans
-- =====================================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CITEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (billing_interval IN ('MONTHLY','QUARTERLY','YEARLY','CUSTOM')),
  price_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR'
    CHECK (currency = upper(currency)),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  max_properties INTEGER CHECK (max_properties IS NULL OR max_properties >= 0),
  max_staff_seats INTEGER CHECK (max_staff_seats IS NULL OR max_staff_seats >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_plans_read_all" ON public.plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "phase1_plans_write_all" ON public.plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- subscriptions
-- =====================================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'TRIAL'
    CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','PAUSED','CANCELLED')),
  starts_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  provider TEXT,
  provider_customer_ref TEXT,
  provider_subscription_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_tenant_status ON public.subscriptions(tenant_id, status);
CREATE UNIQUE INDEX uniq_subscriptions_provider_ref
  ON public.subscriptions(provider, provider_subscription_ref)
  WHERE provider_subscription_ref IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_subscriptions_all_authenticated" ON public.subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- rate_limits + check_rate_limit()
-- =====================================================================
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket_key, window_start)
);
CREATE INDEX idx_rate_limits_expires ON public.rate_limits(expires_at);
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_rate_limits_hidden" ON public.rate_limits
  FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_counter INTEGER;
BEGIN
  -- Fixed window: floor(now / window_seconds) * window_seconds
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_expires_at := v_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limits (bucket_key, window_start, counter, expires_at, updated_at)
  VALUES (p_bucket_key, v_window_start, 1, v_expires_at, now())
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET counter = public.rate_limits.counter + 1,
        updated_at = now()
  RETURNING counter INTO v_counter;

  RETURN v_counter <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- =====================================================================
-- audit_logs (append-only)
-- =====================================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  property_id UUID,
  actor_user_id UUID,
  effective_user_id UUID,
  support_session_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_property ON public.audit_logs(property_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
-- Append-only: only INSERT is granted (no UPDATE/DELETE) at the role level
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase1_audit_logs_hidden" ON public.audit_logs
  FOR SELECT TO authenticated USING (false);
CREATE POLICY "phase1_audit_logs_insert_service" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================================
-- Rewire generic audit trigger to new audit_logs schema
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_tenant UUID;
  v_property UUID;
  v_entity_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSE
    v_old := NULL; v_new := to_jsonb(NEW);
  END IF;

  v_tenant := NULLIF(COALESCE(v_new,v_old)->>'tenant_id','')::uuid;
  v_property := NULLIF(COALESCE(v_new,v_old)->>'property_id','')::uuid;
  BEGIN
    v_entity_id := NULLIF(COALESCE(v_new,v_old)->>'id','')::uuid;
  EXCEPTION WHEN others THEN v_entity_id := NULL;
  END;

  INSERT INTO public.audit_logs (
    tenant_id, property_id, actor_user_id,
    action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_tenant, v_property, v_actor,
    TG_OP, TG_TABLE_NAME, v_entity_id, v_old, v_new
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_log_trigger() TO authenticated, service_role;
