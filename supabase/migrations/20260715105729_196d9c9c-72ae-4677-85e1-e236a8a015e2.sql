
-- ============ ENUM ============
CREATE TYPE public.app_role AS ENUM (
  'SUPER_ADMIN','HOSTEL_ADMIN','ACCOUNTANT','WARDEN','STUDENT','PARENT'
);

-- ============ tenant_memberships ============
CREATE TABLE public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  invited_by UUID,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tenant_memberships readable" ON public.tenant_memberships
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_tenant_memberships_updated BEFORE UPDATE ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ role_assignments ============
CREATE TABLE public.role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role <> 'SUPER_ADMIN'),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  block_id UUID, -- FK deferred to Phase 4
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  CHECK (block_id IS NULL OR property_id IS NOT NULL)
);
CREATE INDEX idx_role_assignments_user_active ON public.role_assignments (user_id, is_active);
CREATE INDEX idx_role_assignments_tenant_role ON public.role_assignments (tenant_id, role, is_active);
CREATE INDEX idx_role_assignments_tenant_property_role ON public.role_assignments (tenant_id, property_id, role, is_active);
CREATE INDEX idx_role_assignments_tenant_block_role ON public.role_assignments (tenant_id, block_id, role, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_assignments TO authenticated;
GRANT ALL ON public.role_assignments TO service_role;
ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own role_assignments readable" ON public.role_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ platform_role_assignments ============
CREATE TABLE public.platform_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role = 'SUPER_ADMIN'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_platform_role_active_unique ON public.platform_role_assignments (user_id) WHERE is_active = true;
GRANT ALL ON public.platform_role_assignments TO service_role;
ALTER TABLE public.platform_role_assignments ENABLE ROW LEVEL SECURITY;
-- no authenticated policies => hidden from client; service_role bypasses RLS.

-- ============ guardians ============
CREATE TABLE public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email CITEXT,
  occupation TEXT,
  address JSONB,
  portal_access_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_guardians_tenant_phone ON public.guardians (tenant_id, phone);
CREATE INDEX idx_guardians_profile ON public.guardians (profile_id) WHERE profile_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardians TO authenticated;
GRANT ALL ON public.guardians TO service_role;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardians authenticated stub" ON public.guardians
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_guardians_updated BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ student_guardians ============
CREATE TABLE public.student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL, -- FK deferred to Phase 5
  guardian_id UUID NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_emergency_contact BOOLEAN NOT NULL DEFAULT false,
  can_pay_fees BOOLEAN NOT NULL DEFAULT true,
  can_view_attendance BOOLEAN NOT NULL DEFAULT true,
  can_view_gate_events BOOLEAN NOT NULL DEFAULT true,
  can_view_complaints BOOLEAN NOT NULL DEFAULT true,
  can_approve_gate_pass BOOLEAN NOT NULL DEFAULT false,
  portal_access_enabled BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlinked_at TIMESTAMPTZ,
  created_by UUID,
  UNIQUE (student_id, guardian_id)
);
CREATE UNIQUE INDEX idx_student_guardians_primary_unique
  ON public.student_guardians (student_id)
  WHERE is_primary = true AND unlinked_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT ALL ON public.student_guardians TO service_role;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_guardians authenticated stub" ON public.student_guardians
  FOR SELECT TO authenticated USING (true);

-- ============ handle_new_user trigger ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ get_user_role helper ============
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID, p_tenant_id UUID)
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_role_assignments
    WHERE user_id = p_user_id AND is_active = true AND role = 'SUPER_ADMIN'
  ) THEN
    RETURN 'SUPER_ADMIN'::public.app_role;
  END IF;

  SELECT role INTO v_role
  FROM public.role_assignments
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND is_active = true
  ORDER BY granted_at DESC
  LIMIT 1;

  RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID, UUID) TO authenticated, service_role;
