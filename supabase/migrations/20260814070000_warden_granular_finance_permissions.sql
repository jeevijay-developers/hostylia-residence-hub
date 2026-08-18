-- Admin > Staff > Add > Warden > "Customize Permissions" now needs
-- independently toggleable finance areas instead of one all-or-nothing
-- "finance" flag, so an Admin can grant a Warden e.g. Refunds without also
-- handing them Fee Plans. The single `permissions.finance` key (and the
-- is_finance_staff() choke-point reading it) doesn't support that — every
-- finance-gated table shared the one flag.
--
-- Checked live data first: no role_assignments row has a non-empty
-- `permissions` yet, so this redefines the key set outright rather than
-- migrating old values.
--
-- Real independently-RLS'd finance resources are just four
-- (fee_plans/fee_plan_components, invoices, payments/payment_orders,
-- refunds) — Receipts, Aging/DSO Reports and GST Invoicing are views/fields
-- computed from `invoices` (no separate table), and discounts/waivers are
-- the `invoices.discount_paise` column, so all five ride along with the
-- `invoices` key rather than getting keys of their own.

ALTER TABLE public.role_assignments
  DROP CONSTRAINT role_assignments_permissions_shape;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (permissions - 'fee_plans' - 'invoices' - 'payments' - 'refunds') = '{}'::jsonb
    AND (NOT (permissions ? 'fee_plans') OR jsonb_typeof(permissions -> 'fee_plans') = 'boolean')
    AND (NOT (permissions ? 'invoices') OR jsonb_typeof(permissions -> 'invoices') = 'boolean')
    AND (NOT (permissions ? 'payments') OR jsonb_typeof(permissions -> 'payments') = 'boolean')
    AND (NOT (permissions ? 'refunds') OR jsonb_typeof(permissions -> 'refunds') = 'boolean')
  );

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member finance overrides: fee_plans, invoices (also covers receipts, aging/DSO reports, GST invoicing, discounts/waivers), payments (cash/cheque recording), refunds. Empty object = use role default. Enforced via has_finance_permission()/can_manage_*().';

-- Generic checker: HOSTEL_ADMIN is unconditional (permissions can't be
-- customized for them, enforced in updateStaff); an explicit override always
-- wins; absent a key, ACCOUNTANT defaults to true and WARDEN to false — same
-- default-access shape is_finance_staff() used, just keyed per resource.
CREATE OR REPLACE FUNCTION public.has_finance_permission(_user_id uuid, _tenant_id uuid, _property_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND (property_id IS NULL OR property_id = _property_id)
      AND (
        role = 'HOSTEL_ADMIN'::app_role
        OR (permissions ->> _key) = 'true'
        OR (
          role = 'ACCOUNTANT'::app_role
          AND (permissions ->> _key) IS DISTINCT FROM 'false'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_finance_permission(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_finance_permission(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_fee_plans(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'fee_plans');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'invoices');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_payments(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'payments');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_refunds(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_finance_permission(_user_id, _tenant_id, _property_id, 'refunds');
$$;

REVOKE ALL ON FUNCTION public.can_manage_fee_plans(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_invoices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_payments(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_refunds(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_fee_plans(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_invoices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_payments(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_refunds(uuid, uuid, uuid) TO authenticated;

-- Re-point each finance table's staff policy at its own resource check
-- instead of the shared is_finance_staff() gate. Same policy names/shapes,
-- only the predicate function changes — student/parent read policies on
-- invoices/payment_orders/payments/refunds are untouched.
DROP POLICY fee_plans_staff_all ON public.fee_plans;
CREATE POLICY fee_plans_staff_all ON public.fee_plans FOR ALL TO authenticated
  USING (public.can_manage_fee_plans(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_fee_plans(auth.uid(), tenant_id, property_id));

DROP POLICY fpc_staff_all ON public.fee_plan_components;
CREATE POLICY fpc_staff_all ON public.fee_plan_components FOR ALL TO authenticated
  USING (public.can_manage_fee_plans(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_fee_plans(auth.uid(), tenant_id, property_id));

DROP POLICY invoices_staff_all ON public.invoices;
CREATE POLICY invoices_staff_all ON public.invoices FOR ALL TO authenticated
  USING (public.can_manage_invoices(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_invoices(auth.uid(), tenant_id, property_id));

DROP POLICY porders_staff_all ON public.payment_orders;
CREATE POLICY porders_staff_all ON public.payment_orders FOR ALL TO authenticated
  USING (public.can_manage_payments(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_payments(auth.uid(), tenant_id, property_id));

DROP POLICY payments_staff_all ON public.payments;
CREATE POLICY payments_staff_all ON public.payments FOR ALL TO authenticated
  USING (public.can_manage_payments(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_payments(auth.uid(), tenant_id, property_id));

DROP POLICY refunds_staff_read ON public.refunds;
CREATE POLICY refunds_staff_read ON public.refunds FOR SELECT TO authenticated
  USING (public.can_manage_refunds(auth.uid(), tenant_id, property_id));

DROP POLICY refunds_staff_insert ON public.refunds;
CREATE POLICY refunds_staff_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_refunds(auth.uid(), tenant_id, property_id)
    AND initiated_by = auth.uid()
    AND status IN ('DRAFT','PENDING_APPROVAL')
  );

DROP POLICY refunds_staff_update_draft ON public.refunds;
CREATE POLICY refunds_staff_update_draft ON public.refunds FOR UPDATE TO authenticated
  USING (
    public.can_manage_refunds(auth.uid(), tenant_id, property_id)
    AND status = 'DRAFT'
    AND initiated_by = auth.uid()
  )
  WITH CHECK (
    public.can_manage_refunds(auth.uid(), tenant_id, property_id)
    AND status IN ('DRAFT','PENDING_APPROVAL','CANCELLED')
  );

-- Deposit ledger entries are written/read alongside payment recording
-- (deposit capture, adjustments) — same resource as Cash/Cheque Payments.
DROP POLICY dep_ledger_staff_insert ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_staff_insert ON public.deposit_ledger_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_payments(auth.uid(), tenant_id, property_id));

DROP POLICY dep_ledger_staff_read ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_staff_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.can_manage_payments(auth.uid(), tenant_id, property_id));

-- record_manual_payment() (cash/cheque recording, folds in post-payment
-- allocation activation) checked is_finance_staff() directly — same swap,
-- no other logic changes.
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
  IF NOT public.can_manage_payments(v_uid, v_inv.tenant_id, v_inv.property_id) THEN
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

-- Storage: receipts bucket also gated on the old blanket flag — receipts
-- ride along with the `invoices` key (see comment at top of file).
DROP POLICY receipts_finance_select ON storage.objects;
CREATE POLICY receipts_finance_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_write ON storage.objects;
CREATE POLICY receipts_finance_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_update ON storage.objects;
CREATE POLICY receipts_finance_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_delete ON storage.objects;
CREATE POLICY receipts_finance_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );

-- Nothing reads the old blanket gate anymore (every policy/function above
-- was re-pointed at the granular can_manage_*() checks) — drop it rather
-- than leave a stale, unused, misleadingly-named gate sitting next to them.
DROP FUNCTION public.is_finance_staff(uuid, uuid, uuid);
