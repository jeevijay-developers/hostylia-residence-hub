-- tenant_memberships and role_assignments were created with a SELECT-only
-- policy ("read your own row") and no INSERT/UPDATE policy at all. With RLS
-- enabled and no matching policy, every write is denied by default, so the
-- Staff invite flow (admin-staff.functions.ts inviteStaff/revokeStaff/
-- activateMyInvites) fails with "new row violates row-level security policy
-- for table tenant_memberships" the moment it tries to upsert an INVITED
-- membership. Add the missing admin-manage and self-activate policies,
-- following the has_tenant_role() pattern already used on properties/
-- tenant_feature_overrides/etc.

-- ============ tenant_memberships ============
CREATE POLICY "tenant admin manage tenant_memberships" ON public.tenant_memberships
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

CREATE POLICY "self activate tenant_memberships" ON public.tenant_memberships
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============ role_assignments ============
CREATE POLICY "tenant admin manage role_assignments" ON public.role_assignments
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

CREATE POLICY "self activate role_assignments" ON public.role_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
