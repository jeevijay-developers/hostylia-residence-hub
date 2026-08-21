-- Accountant Permissions: the task's explicit scope is Finance Dashboard
-- (Read), Invoices (Read/Create/Edit — no Delete), Payments (Read/Create —
-- no Edit/Delete), Receipts (Read/Create — already covered by
-- invoices_view/create per the existing comment on this column), Fee Plans
-- (Read/Create/Edit — no Delete), Outstanding/Aging/Financial Reports
-- (Read/Export). Non-finance modules (properties management, rooms/beds,
-- attendance, complaints, gate pass, visitors, staff management, settings)
-- already have zero Accountant access — verified against live RLS before
-- writing this migration, nothing to change there.
--
-- Two real gaps against that scope today:
--   1. invoices_delete defaults true for ACCOUNTANT (can_delete_invoices
--      uses has_role_permission(...,'ACCOUNTANT',...)) — no Delete/Void UI
--      is exposed to Accountant anywhere, but the RLS default still grants
--      it. Flip the default role to HOSTEL_ADMIN (opt-in only), same as
--      rooms_beds_create/delete already are.
--   2. `fee_plans` and `payments` are still coarse FOR-ALL keys (bundle
--      every verb together) — Accountant needs Delete withheld on both
--      without losing View/Create/Edit, which a single bundled key can't
--      express. Split each into 4 independent verb keys, same pattern the
--      invoices pilot (20260814110000) already used for invoices.
--
-- Checked live data first: no role_assignments row has fee_plans/payments
-- set (confirmed via SQL before writing this), so the coarse keys can be
-- retired outright rather than migrated.

-- ============================================================
-- 1) FEE PLANS — split into 4 verbs
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_fee_plans(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'fee_plans_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_fee_plans(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'fee_plans_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_fee_plans(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'fee_plans_edit');
$$;
-- No default role owns Delete — matches rooms_beds_create/delete's shape:
-- a brand-new-scoped capability, admin-only unless explicitly granted.
CREATE OR REPLACE FUNCTION public.can_delete_fee_plans(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'fee_plans_delete');
$$;

-- ============================================================
-- 2) PAYMENTS — split into 4 verbs (also backs payment_orders and
--    deposit_ledger_entries, which rode along with the old bundled key)
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_payments(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'payments_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_payments(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'payments_create');
$$;
-- Edit/Delete on captured payments were never a real UI action for anyone
-- but Admin (PaymentHistoryPanel is read-only, record_manual_payment is
-- insert-only) — admin-only unless explicitly granted.
CREATE OR REPLACE FUNCTION public.can_edit_payments(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'payments_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_payments(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'payments_delete');
$$;

-- ============================================================
-- 3) INVOICES — Accountant no longer defaults to Delete (same function,
--    same key, just the default-owning role flips from ACCOUNTANT to
--    HOSTEL_ADMIN — no Delete/Void UI is exposed to Accountant today, so
--    this doesn't change any working behavior).
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_delete_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'invoices_delete');
$$;

DO $do$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'can_view_fee_plans(uuid,uuid,uuid)', 'can_create_fee_plans(uuid,uuid,uuid)',
    'can_edit_fee_plans(uuid,uuid,uuid)', 'can_delete_fee_plans(uuid,uuid,uuid)',
    'can_view_payments(uuid,uuid,uuid)', 'can_create_payments(uuid,uuid,uuid)',
    'can_edit_payments(uuid,uuid,uuid)', 'can_delete_payments(uuid,uuid,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END;
$do$;

-- ============================================================
-- 4) Widen the permissions JSONB shape: retire coarse fee_plans/payments,
--    add the 8 verb keys.
-- ============================================================
ALTER TABLE public.role_assignments DROP CONSTRAINT role_assignments_permissions_shape;
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_permissions_shape CHECK (
  jsonb_typeof(permissions) = 'object'
  AND (
    permissions
    - 'refunds'
    - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
    - 'complaints' - 'gate_events' - 'notices' - 'mess_menus' - 'feedback'
    - 'students_view' - 'students_create' - 'students_edit' - 'students_delete'
    - 'allocations_view' - 'allocations_create' - 'allocations_edit'
    - 'rooms_beds_view' - 'rooms_beds_edit' - 'rooms_beds_create' - 'rooms_beds_delete'
    - 'attendance_view' - 'attendance_create' - 'attendance_edit' - 'attendance_delete'
    - 'gate_passes_view' - 'gate_passes_create' - 'gate_passes_edit' - 'gate_passes_delete'
    - 'visitors_view' - 'visitors_create' - 'visitors_edit' - 'visitors_delete'
    - 'reports_view'
    - 'fee_plans_view' - 'fee_plans_create' - 'fee_plans_edit' - 'fee_plans_delete'
    - 'payments_view' - 'payments_create' - 'payments_edit' - 'payments_delete'
  ) = '{}'::jsonb
  AND (NOT (permissions ? 'refunds') OR jsonb_typeof(permissions -> 'refunds') = 'boolean')
  AND (NOT (permissions ? 'invoices_view') OR jsonb_typeof(permissions -> 'invoices_view') = 'boolean')
  AND (NOT (permissions ? 'invoices_create') OR jsonb_typeof(permissions -> 'invoices_create') = 'boolean')
  AND (NOT (permissions ? 'invoices_edit') OR jsonb_typeof(permissions -> 'invoices_edit') = 'boolean')
  AND (NOT (permissions ? 'invoices_delete') OR jsonb_typeof(permissions -> 'invoices_delete') = 'boolean')
  AND (NOT (permissions ? 'complaints') OR jsonb_typeof(permissions -> 'complaints') = 'boolean')
  AND (NOT (permissions ? 'gate_events') OR jsonb_typeof(permissions -> 'gate_events') = 'boolean')
  AND (NOT (permissions ? 'notices') OR jsonb_typeof(permissions -> 'notices') = 'boolean')
  AND (NOT (permissions ? 'mess_menus') OR jsonb_typeof(permissions -> 'mess_menus') = 'boolean')
  AND (NOT (permissions ? 'feedback') OR jsonb_typeof(permissions -> 'feedback') = 'boolean')
  AND (NOT (permissions ? 'students_view') OR jsonb_typeof(permissions -> 'students_view') = 'boolean')
  AND (NOT (permissions ? 'students_create') OR jsonb_typeof(permissions -> 'students_create') = 'boolean')
  AND (NOT (permissions ? 'students_edit') OR jsonb_typeof(permissions -> 'students_edit') = 'boolean')
  AND (NOT (permissions ? 'students_delete') OR jsonb_typeof(permissions -> 'students_delete') = 'boolean')
  AND (NOT (permissions ? 'allocations_view') OR jsonb_typeof(permissions -> 'allocations_view') = 'boolean')
  AND (NOT (permissions ? 'allocations_create') OR jsonb_typeof(permissions -> 'allocations_create') = 'boolean')
  AND (NOT (permissions ? 'allocations_edit') OR jsonb_typeof(permissions -> 'allocations_edit') = 'boolean')
  AND (NOT (permissions ? 'rooms_beds_view') OR jsonb_typeof(permissions -> 'rooms_beds_view') = 'boolean')
  AND (NOT (permissions ? 'rooms_beds_edit') OR jsonb_typeof(permissions -> 'rooms_beds_edit') = 'boolean')
  AND (NOT (permissions ? 'rooms_beds_create') OR jsonb_typeof(permissions -> 'rooms_beds_create') = 'boolean')
  AND (NOT (permissions ? 'rooms_beds_delete') OR jsonb_typeof(permissions -> 'rooms_beds_delete') = 'boolean')
  AND (NOT (permissions ? 'attendance_view') OR jsonb_typeof(permissions -> 'attendance_view') = 'boolean')
  AND (NOT (permissions ? 'attendance_create') OR jsonb_typeof(permissions -> 'attendance_create') = 'boolean')
  AND (NOT (permissions ? 'attendance_edit') OR jsonb_typeof(permissions -> 'attendance_edit') = 'boolean')
  AND (NOT (permissions ? 'attendance_delete') OR jsonb_typeof(permissions -> 'attendance_delete') = 'boolean')
  AND (NOT (permissions ? 'gate_passes_view') OR jsonb_typeof(permissions -> 'gate_passes_view') = 'boolean')
  AND (NOT (permissions ? 'gate_passes_create') OR jsonb_typeof(permissions -> 'gate_passes_create') = 'boolean')
  AND (NOT (permissions ? 'gate_passes_edit') OR jsonb_typeof(permissions -> 'gate_passes_edit') = 'boolean')
  AND (NOT (permissions ? 'gate_passes_delete') OR jsonb_typeof(permissions -> 'gate_passes_delete') = 'boolean')
  AND (NOT (permissions ? 'visitors_view') OR jsonb_typeof(permissions -> 'visitors_view') = 'boolean')
  AND (NOT (permissions ? 'visitors_create') OR jsonb_typeof(permissions -> 'visitors_create') = 'boolean')
  AND (NOT (permissions ? 'visitors_edit') OR jsonb_typeof(permissions -> 'visitors_edit') = 'boolean')
  AND (NOT (permissions ? 'visitors_delete') OR jsonb_typeof(permissions -> 'visitors_delete') = 'boolean')
  AND (NOT (permissions ? 'reports_view') OR jsonb_typeof(permissions -> 'reports_view') = 'boolean')
  AND (NOT (permissions ? 'fee_plans_view') OR jsonb_typeof(permissions -> 'fee_plans_view') = 'boolean')
  AND (NOT (permissions ? 'fee_plans_create') OR jsonb_typeof(permissions -> 'fee_plans_create') = 'boolean')
  AND (NOT (permissions ? 'fee_plans_edit') OR jsonb_typeof(permissions -> 'fee_plans_edit') = 'boolean')
  AND (NOT (permissions ? 'fee_plans_delete') OR jsonb_typeof(permissions -> 'fee_plans_delete') = 'boolean')
  AND (NOT (permissions ? 'payments_view') OR jsonb_typeof(permissions -> 'payments_view') = 'boolean')
  AND (NOT (permissions ? 'payments_create') OR jsonb_typeof(permissions -> 'payments_create') = 'boolean')
  AND (NOT (permissions ? 'payments_edit') OR jsonb_typeof(permissions -> 'payments_edit') = 'boolean')
  AND (NOT (permissions ? 'payments_delete') OR jsonb_typeof(permissions -> 'payments_delete') = 'boolean')
);

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member overrides, one JSONB bag of {module}_{verb}: boolean (or a coarse {module}: boolean for resources with only one meaningful verb). Absent key = role default; HOSTEL_ADMIN is always unconditional. reports_view is client-side only (no RLS-gated reports resource exists). fee_plans_view/create/edit and payments_view/create default true for ACCOUNTANT; *_delete and payments_edit default to HOSTEL_ADMIN-only (opt-in).';

-- ============================================================
-- 5) FEE PLANS policies
-- ============================================================
DROP POLICY fee_plans_staff_all ON public.fee_plans;
CREATE POLICY fee_plans_staff_select ON public.fee_plans FOR SELECT TO authenticated
  USING (public.can_view_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fee_plans_staff_insert ON public.fee_plans FOR INSERT TO authenticated
  WITH CHECK (public.can_create_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fee_plans_staff_update ON public.fee_plans FOR UPDATE TO authenticated
  USING (public.can_edit_fee_plans(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fee_plans_staff_delete ON public.fee_plans FOR DELETE TO authenticated
  USING (public.can_delete_fee_plans(auth.uid(), tenant_id, property_id));

DROP POLICY fpc_staff_all ON public.fee_plan_components;
CREATE POLICY fpc_staff_select ON public.fee_plan_components FOR SELECT TO authenticated
  USING (public.can_view_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fpc_staff_insert ON public.fee_plan_components FOR INSERT TO authenticated
  WITH CHECK (public.can_create_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fpc_staff_update ON public.fee_plan_components FOR UPDATE TO authenticated
  USING (public.can_edit_fee_plans(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_fee_plans(auth.uid(), tenant_id, property_id));
CREATE POLICY fpc_staff_delete ON public.fee_plan_components FOR DELETE TO authenticated
  USING (public.can_delete_fee_plans(auth.uid(), tenant_id, property_id));

-- ============================================================
-- 6) PAYMENTS / PAYMENT_ORDERS / DEPOSIT_LEDGER_ENTRIES policies
-- ============================================================
DROP POLICY payments_staff_all ON public.payments;
CREATE POLICY payments_staff_select ON public.payments FOR SELECT TO authenticated
  USING (public.can_view_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY payments_staff_insert ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.can_create_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY payments_staff_update ON public.payments FOR UPDATE TO authenticated
  USING (public.can_edit_payments(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY payments_staff_delete ON public.payments FOR DELETE TO authenticated
  USING (public.can_delete_payments(auth.uid(), tenant_id, property_id));

DROP POLICY porders_staff_all ON public.payment_orders;
CREATE POLICY porders_staff_select ON public.payment_orders FOR SELECT TO authenticated
  USING (public.can_view_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY porders_staff_insert ON public.payment_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_create_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY porders_staff_update ON public.payment_orders FOR UPDATE TO authenticated
  USING (public.can_edit_payments(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_payments(auth.uid(), tenant_id, property_id));
CREATE POLICY porders_staff_delete ON public.payment_orders FOR DELETE TO authenticated
  USING (public.can_delete_payments(auth.uid(), tenant_id, property_id));

DROP POLICY dep_ledger_staff_insert ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_staff_insert ON public.deposit_ledger_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_create_payments(auth.uid(), tenant_id, property_id));
DROP POLICY dep_ledger_staff_read ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_staff_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.can_view_payments(auth.uid(), tenant_id, property_id));

-- record_manual_payment() checked the coarse gate directly — repoint to Create.
CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_invoice_id uuid,
  p_mode text,
  p_amount_paise bigint,
  p_offline_reference text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS public.payments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.invoices;
  v_uid uuid := auth.uid();
  v_pay public.payments;
  v_alloc_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF NOT public.can_create_payments(v_uid, v_inv.tenant_id, v_inv.property_id) THEN
    RAISE EXCEPTION 'Only finance staff may record payments';
  END IF;
  IF v_inv.status NOT IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') THEN
    RAISE EXCEPTION 'Cannot record a payment against a % invoice', lower(v_inv.status);
  END IF;
  IF p_amount_paise > v_inv.balance_paise THEN
    RAISE EXCEPTION 'Amount exceeds outstanding balance (% INR)', (v_inv.balance_paise / 100.0);
  END IF;

  INSERT INTO public.payments (
    tenant_id, property_id, student_id, invoice_id, payment_number, mode,
    amount_paise, status, paid_at, recorded_by, offline_reference, cheque_date, notes
  ) VALUES (
    v_inv.tenant_id, v_inv.property_id, v_inv.student_id, p_invoice_id, '', p_mode,
    p_amount_paise, 'CAPTURED', now(), v_uid, p_offline_reference, p_cheque_date, p_notes
  ) RETURNING * INTO v_pay;

  SELECT id INTO v_alloc_id
    FROM public.allocations
    WHERE student_id = v_inv.student_id AND status = 'PENDING_PAYMENT'
    ORDER BY created_at DESC
    LIMIT 1;
  IF v_alloc_id IS NOT NULL THEN
    PERFORM public.activate_allocation(v_alloc_id);
  END IF;

  RETURN v_pay;
END $$;

REVOKE ALL ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) FROM anon;

-- Receipts storage bucket already keys off can_view_invoices/can_create_invoices
-- /can_edit_invoices/can_delete_invoices (set by the 20260814110000 pilot) —
-- unaffected by this migration.

-- ============================================================
-- 7) Retire the coarse checkers nothing references anymore.
-- ============================================================
DROP FUNCTION IF EXISTS public.can_manage_fee_plans(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_manage_payments(uuid, uuid, uuid);
