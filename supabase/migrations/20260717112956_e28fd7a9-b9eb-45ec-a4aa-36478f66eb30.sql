
-- 1) guardians_email_phone_visible_to_tenant_staff: scope reads to admin/warden/finance only
DROP POLICY IF EXISTS guardians_select_scoped ON public.guardians;
CREATE POLICY guardians_select_scoped ON public.guardians FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR profile_id = auth.uid()
  OR has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
  OR has_tenant_role(auth.uid(), tenant_id, 'WARDEN'::app_role)
  OR has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT'::app_role)
);

-- 2) plans_and_plan_features_broad_read: restrict to active/trialing subscribers of their tenant + super admin
DROP POLICY IF EXISTS phase1_plans_read_all ON public.plans;
CREATE POLICY plans_read_scoped ON public.plans FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.plan_id = plans.id
      AND s.status IN ('ACTIVE','TRIALING')
      AND has_tenant_role(auth.uid(), s.tenant_id, 'HOSTEL_ADMIN'::app_role)
  )
);

DROP POLICY IF EXISTS plan_features_read_auth ON public.plan_features;
CREATE POLICY plan_features_read_scoped ON public.plan_features FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.plan_id = plan_features.plan_id
      AND s.status IN ('ACTIVE','TRIALING')
      AND has_tenant_role(auth.uid(), s.tenant_id, 'HOSTEL_ADMIN'::app_role)
  )
);

-- 3) receipts_missing_student_parent_access: allow owning student & paying-parent guardian to read their own receipt file
-- Path layout: <tenant_id>/<property_id>/<payment_id>.<ext>
CREATE POLICY receipts_student_parent_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.payments p
    JOIN public.students s ON s.id = p.student_id
    WHERE p.id::text = split_part((storage.foldername(name))[3], '.', 1)
      AND (
        s.profile_id = auth.uid()
        OR public.is_paying_parent(auth.uid(), s.id)
      )
  )
);

-- 4) SUPA_rls_policy_always_true: audit_logs INSERT WITH CHECK true
-- audit_log_trigger is SECURITY DEFINER owned by postgres (bypasses RLS), so no direct client insert needed.
DROP POLICY IF EXISTS phase1_audit_logs_insert_service ON public.audit_logs;
CREATE POLICY audit_logs_no_direct_insert ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (false);

-- 5) SUPA_authenticated_security_definer_function_executable:
-- Revoke EXECUTE from PUBLIC and authenticated on internal trigger/cron/admin SECURITY DEFINER functions.
-- Policy-helper and client-RPC functions retain authenticated EXECUTE (required to work).
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'audit_log_trigger()',
    'handle_new_user()',
    'bump_conversation_updated_at()',
    'set_updated_at()',
    'validate_message_sender()',
    'validate_room_hierarchy()',
    'validate_bed_hierarchy()',
    'validate_floor_hierarchy()',
    'validate_allocation_hierarchy()',
    'fn_invoice_number()',
    'fn_payment_number()',
    'fn_refund_number()',
    'fn_gate_pass_number()',
    'fn_generate_complaint_number()',
    'fn_complaint_set_sla_due()',
    'fn_complaint_lifecycle()',
    'fn_complaint_auto_assign()',
    'fn_complaint_validate_assignee()',
    'fn_recalc_invoice_status()',
    'fn_refund_maker_checker()',
    'fn_flip_bed_status()',
    'fn_check_gatepass_curfew()',
    'fn_validate_parent_approval()',
    'fn_tenants_guard_status_columns()',
    'fn_property_seed_categories()',
    'fn_seed_default_complaint_categories(uuid)',
    'fn_scan_complaint_sla_breaches()',
    'fn_generate_invoices()',
    'fn_send_fee_reminders()',
    'fn_enqueue_in_app_notification(uuid,uuid,uuid,text,text,jsonb,text)',
    'fn_effective_feature(uuid,text)',
    'fn_get_platform_metrics()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', fn, SQLERRM;
    END;
  END LOOP;
END $$;
