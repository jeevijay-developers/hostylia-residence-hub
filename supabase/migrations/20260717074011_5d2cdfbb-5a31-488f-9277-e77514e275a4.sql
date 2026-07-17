
-- ============================================================================
-- Helper: any active staff role in tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_any_tenant_role(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND status = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
  );
$$;

-- ============================================================================
-- Tenants
-- ============================================================================
DROP POLICY IF EXISTS phase1_tenants_all_authenticated ON public.tenants;
CREATE POLICY tenants_select_scoped ON public.tenants FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), id));
CREATE POLICY tenants_update_admin ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), id, 'HOSTEL_ADMIN'::app_role));
CREATE POLICY tenants_insert_super ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY tenants_delete_super ON public.tenants FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ============================================================================
-- Organizations (tenant-scoped)
-- ============================================================================
DROP POLICY IF EXISTS phase1_orgs_all_authenticated ON public.organizations;
CREATE POLICY organizations_select_scoped ON public.organizations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY organizations_write_admin ON public.organizations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

-- ============================================================================
-- Properties (tenant-scoped)
-- ============================================================================
DROP POLICY IF EXISTS phase1_properties_all_authenticated ON public.properties;
CREATE POLICY properties_select_scoped ON public.properties FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY properties_write_admin ON public.properties FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

-- ============================================================================
-- Subscriptions (billing) — admin/super read only
-- ============================================================================
DROP POLICY IF EXISTS phase1_subscriptions_all_authenticated ON public.subscriptions;
CREATE POLICY subscriptions_select_admin ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));
CREATE POLICY subscriptions_write_super ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================================
-- Plans — public read for signed-in, super-admin write
-- ============================================================================
DROP POLICY IF EXISTS phase1_plans_write_all ON public.plans;
CREATE POLICY plans_select_authenticated ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_write_super ON public.plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================================
-- Guardians
-- ============================================================================
DROP POLICY IF EXISTS "guardians authenticated stub" ON public.guardians;
CREATE POLICY guardians_select_scoped ON public.guardians FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR profile_id = auth.uid()
    OR public.has_any_tenant_role(auth.uid(), tenant_id)
  );
CREATE POLICY guardians_write_staff ON public.guardians FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.has_tenant_role(auth.uid(), tenant_id, 'WARDEN'::app_role)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.has_tenant_role(auth.uid(), tenant_id, 'WARDEN'::app_role)
  );

-- ============================================================================
-- Student-guardian links
-- ============================================================================
DROP POLICY IF EXISTS "student_guardians authenticated stub" ON public.student_guardians;
CREATE POLICY student_guardians_select_scoped ON public.student_guardians FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_any_tenant_role(auth.uid(), tenant_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = guardian_id AND g.profile_id = auth.uid())
  );
CREATE POLICY student_guardians_write_staff ON public.student_guardians FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.has_tenant_role(auth.uid(), tenant_id, 'WARDEN'::app_role)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.has_tenant_role(auth.uid(), tenant_id, 'WARDEN'::app_role)
  );

-- ============================================================================
-- Storage: receipts bucket → finance staff of the tenant only.
-- Path convention: <tenant_id>/<property_id>/<payment_id>.<ext>
-- ============================================================================
DROP POLICY IF EXISTS receipts_finance_all ON storage.objects;
CREATE POLICY receipts_finance_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_finance_staff(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
CREATE POLICY receipts_finance_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_finance_staff(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
CREATE POLICY receipts_finance_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_finance_staff(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
CREATE POLICY receipts_finance_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_finance_staff(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );

-- ============================================================================
-- Lock down SECURITY DEFINER function EXECUTE grants.
-- Revoke from anon+authenticated for internal helpers; keep only those
-- intentionally called via RPC/RLS.
-- ============================================================================

-- Trigger / internal-only functions: revoke from anon + authenticated.
REVOKE EXECUTE ON FUNCTION public.audit_log_trigger()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_complaint_auto_assign()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_complaint_validate_assignee()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_validate_parent_approval()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_gatepass_curfew()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_property_seed_categories()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_seed_default_complaint_categories(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_in_app_notification(uuid, uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_generate_invoices()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_send_fee_reminders()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scan_complaint_sla_breaches()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)        FROM PUBLIC, anon, authenticated;

-- RPCs & policy helpers: revoke from anon only, keep authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_approve_refund(uuid, text, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_end_support_session(uuid, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_platform_metrics()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_effective_feature(uuid, text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid, uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_conversation(uuid, uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, app_role)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_hostel_admin(uuid, uuid, uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_finance_staff(uuid, uuid, uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owning_student(uuid, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_paying_parent(uuid, uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.warden_can_read_property(uuid, uuid, uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.warden_can_write_scope(uuid, uuid, uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_tenant_role(uuid, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid)                    FROM PUBLIC, anon;
