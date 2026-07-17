-- Phase 13 hardening: tighten tenants/organizations/properties/plans/subscriptions RLS
-- Replaces overly broad is_tenant_member SELECT policies with role-scoped access
-- and adds a trigger blocking non-SUPER_ADMIN updates to tenant status columns.

-- ============ tenants ============
DROP POLICY IF EXISTS tenants_select_scoped ON public.tenants;
CREATE POLICY tenants_select_scoped ON public.tenants FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_tenant_member(auth.uid(), id)
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.tenant_id = tenants.id AND s.profile_id = auth.uid() AND s.deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.guardians g
    WHERE g.tenant_id = tenants.id AND g.profile_id = auth.uid() AND g.deleted_at IS NULL
  )
);

-- Only SUPER_ADMIN may change lifecycle/status columns.
CREATE OR REPLACE FUNCTION public.fn_tenants_guard_status_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
    RAISE EXCEPTION 'Only SUPER_ADMIN may change tenant status/onboarding/suspended/cancelled fields';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_guard_status ON public.tenants;
CREATE TRIGGER trg_tenants_guard_status
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.fn_tenants_guard_status_columns();

-- ============ organizations ============
DROP POLICY IF EXISTS organizations_select_scoped ON public.organizations;
CREATE POLICY organizations_select_scoped ON public.organizations FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  OR public.has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT'::public.app_role)
);
-- organizations_write_admin (HOSTEL_ADMIN/SUPER_ADMIN ALL) is unchanged.

-- ============ properties ============
DROP POLICY IF EXISTS properties_select_scoped ON public.properties;

CREATE POLICY properties_select_staff ON public.properties FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  OR public.has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT'::public.app_role)
  OR public.warden_can_read_property(auth.uid(), tenant_id, id)
);

CREATE POLICY properties_select_student ON public.properties FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.property_id = properties.id
      AND s.profile_id = auth.uid()
      AND s.deleted_at IS NULL
  )
);

CREATE POLICY properties_select_parent ON public.properties FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    JOIN public.students   s ON s.id = sg.student_id
    WHERE s.property_id = properties.id
      AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid()
      AND g.deleted_at IS NULL
  )
);
-- properties_write_admin (HOSTEL_ADMIN/SUPER_ADMIN ALL) is unchanged.

-- ============ plans ============
-- Drop duplicate SELECT; keep phase1_plans_read_all (authenticated SELECT).
-- Write policy plans_write_super (SUPER_ADMIN ALL) is unchanged.
DROP POLICY IF EXISTS plans_select_authenticated ON public.plans;

-- ============ subscriptions ============
-- Already correct: subscriptions_select_admin (super + HOSTEL_ADMIN SELECT),
-- subscriptions_write_super (SUPER_ADMIN ALL). No change.
