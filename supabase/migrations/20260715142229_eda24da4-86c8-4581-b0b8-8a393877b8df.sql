
-- =========================================================================
-- Phase 8 — Payments / Finance
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','FAILED','SKIPPED')),
  error text,
  UNIQUE(provider, event_id)
);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_hidden" ON public.webhook_events FOR SELECT TO authenticated USING (false);

CREATE TABLE public.fee_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  billing_frequency text NOT NULL CHECK (billing_frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','ONE_TIME','CUSTOM')),
  currency char(3) NOT NULL DEFAULT 'INR',
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  grace_period_days integer NOT NULL DEFAULT 0,
  late_fee_type text NOT NULL DEFAULT 'NONE' CHECK (late_fee_type IN ('NONE','FIXED','PERCENTAGE')),
  late_fee_value bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  effective_from date NOT NULL,
  effective_until date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
CREATE UNIQUE INDEX uniq_fee_plans_property_code ON public.fee_plans(property_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_fee_plans_tenant_property ON public.fee_plans(tenant_id, property_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_plans TO authenticated;
GRANT ALL ON public.fee_plans TO service_role;
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fee_plan_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  fee_plan_id uuid NOT NULL REFERENCES public.fee_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('RENT','MESS','DEPOSIT','MAINTENANCE','ONE_TIME','LATE_FEE','OTHER')),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  is_refundable boolean NOT NULL DEFAULT false,
  is_taxable boolean NOT NULL DEFAULT false,
  tax_rate_basis_points integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fpc_plan ON public.fee_plan_components(fee_plan_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_plan_components TO authenticated;
GRANT ALL ON public.fee_plan_components TO service_role;
ALTER TABLE public.fee_plan_components ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  allocation_id uuid REFERENCES public.allocations(id) ON DELETE SET NULL,
  fee_plan_id uuid REFERENCES public.fee_plans(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  billing_period_start date,
  billing_period_end date,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID','PARTIALLY_REFUNDED','REFUNDED')),
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise bigint NOT NULL DEFAULT 0,
  tax_paise bigint NOT NULL DEFAULT 0,
  late_fee_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  paid_paise bigint NOT NULL DEFAULT 0 CHECK (paid_paise >= 0),
  refunded_paise bigint NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0),
  balance_paise bigint NOT NULL CHECK (balance_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  gst_invoice boolean NOT NULL DEFAULT false,
  seller_gstin_snapshot text,
  buyer_gstin_snapshot text,
  notes text,
  issued_at timestamptz,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT invoices_total_math CHECK (total_paise = subtotal_paise - discount_paise + tax_paise + late_fee_paise)
);
CREATE UNIQUE INDEX uniq_invoices_property_number ON public.invoices(property_id, invoice_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uniq_invoices_alloc_period ON public.invoices(allocation_id, billing_period_start, billing_period_end, fee_plan_id)
  WHERE allocation_id IS NOT NULL AND billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL AND fee_plan_id IS NOT NULL AND status <> 'VOID' AND deleted_at IS NULL;
CREATE INDEX idx_invoices_student ON public.invoices(student_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_property_status ON public.invoices(property_id, status) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_order_ref text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PENDING','PAID','FAILED','EXPIRED','CANCELLED')),
  idempotency_key text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_order_ref),
  UNIQUE(tenant_id, idempotency_key)
);
CREATE INDEX idx_payment_orders_student ON public.payment_orders(student_id);
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_order_id uuid REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  payment_number text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('UPI','CARD','NETBANKING','CASH','CHEQUE','BANK_TRANSFER','OTHER')),
  provider text,
  provider_payment_ref text,
  provider_order_ref text,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PENDING','AUTHORIZED','CAPTURED','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED')),
  paid_at timestamptz,
  recorded_by uuid,
  offline_reference text,
  cheque_date date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_payments_property_number ON public.payments(property_id, payment_number);
CREATE UNIQUE INDEX uniq_payments_provider_ref ON public.payments(provider, provider_payment_ref) WHERE provider_payment_ref IS NOT NULL;
CREATE INDEX idx_payments_student ON public.payments(student_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  refund_number text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  reason text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('ORIGINAL_METHOD','BANK_TRANSFER','CASH','OTHER')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED','CANCELLED')),
  initiated_by uuid NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  decision_reason text,
  provider_refund_ref text,
  expected_completion_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_refunds_property_number ON public.refunds(property_id, refund_number);
CREATE INDEX idx_refunds_payment ON public.refunds(payment_id);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deposit_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES public.allocations(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('DEPOSIT_CHARGED','DEPOSIT_RECEIVED','DEDUCTION','ADJUSTMENT','REFUND_INITIATED','REFUND_COMPLETED','REVERSAL')),
  amount_paise bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  reference_type text,
  reference_id uuid,
  description text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dep_ledger_alloc ON public.deposit_ledger_entries(allocation_id, created_at);
GRANT SELECT, INSERT ON public.deposit_ledger_entries TO authenticated;
GRANT ALL ON public.deposit_ledger_entries TO service_role;
ALTER TABLE public.deposit_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_finance_staff(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND role IN ('ACCOUNTANT'::app_role, 'HOSTEL_ADMIN'::app_role)
      AND (property_id IS NULL OR property_id = _property_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hostel_admin(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND role = 'HOSTEL_ADMIN'::app_role
      AND (property_id IS NULL OR property_id = _property_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owning_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.students WHERE id = _student_id AND profile_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_paying_parent(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_pay_fees, false) = true
  );
$$;

-- Policies
CREATE POLICY fee_plans_staff_all ON public.fee_plans FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));

CREATE POLICY fpc_staff_all ON public.fee_plan_components FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));

CREATE POLICY invoices_staff_all ON public.invoices FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY invoices_student_read ON public.invoices FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY invoices_parent_read ON public.invoices FOR SELECT TO authenticated
  USING (public.is_paying_parent(auth.uid(), student_id));

CREATE POLICY porders_staff_all ON public.payment_orders FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY porders_student_own ON public.payment_orders FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));
CREATE POLICY porders_student_insert ON public.payment_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_owning_student(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

CREATE POLICY payments_staff_all ON public.payments FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY payments_student_read ON public.payments FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

CREATE POLICY refunds_staff_read ON public.refunds FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY refunds_staff_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (
    public.is_finance_staff(auth.uid(), tenant_id, property_id)
    AND initiated_by = auth.uid()
    AND status IN ('DRAFT','PENDING_APPROVAL')
  );
CREATE POLICY refunds_staff_update_draft ON public.refunds FOR UPDATE TO authenticated
  USING (
    public.is_finance_staff(auth.uid(), tenant_id, property_id)
    AND status = 'DRAFT'
    AND initiated_by = auth.uid()
  )
  WITH CHECK (
    public.is_finance_staff(auth.uid(), tenant_id, property_id)
    AND status IN ('DRAFT','PENDING_APPROVAL','CANCELLED')
  );
CREATE POLICY refunds_student_read ON public.refunds FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

CREATE POLICY dep_ledger_staff_insert ON public.deposit_ledger_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY dep_ledger_staff_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid(), tenant_id, property_id));
CREATE POLICY dep_ledger_student_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

-- Triggers
CREATE TRIGGER trg_fee_plans_updated_at BEFORE UPDATE ON public.fee_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fpc_updated_at BEFORE UPDATE ON public.fee_plan_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payment_orders_updated_at BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_refund_maker_checker()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_paid bigint; v_refunded bigint;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    IF NEW.approved_by IS NULL THEN RAISE EXCEPTION 'approved_by required when moving to APPROVED'; END IF;
    IF NEW.initiated_by = NEW.approved_by THEN
      RAISE EXCEPTION 'Self-approval blocked: initiated_by (%) cannot equal approved_by', NEW.initiated_by;
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    SELECT amount_paise INTO v_paid FROM public.payments WHERE id = NEW.payment_id;
    SELECT COALESCE(SUM(amount_paise),0) INTO v_refunded FROM public.refunds
      WHERE payment_id = NEW.payment_id AND status = 'COMPLETED' AND id <> NEW.id;
    IF v_refunded + NEW.amount_paise > v_paid THEN
      RAISE EXCEPTION 'Refund total (%) exceeds payment amount (%)', v_refunded + NEW.amount_paise, v_paid;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_refund_maker_checker BEFORE INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refund_maker_checker();

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_inv record; v_paid bigint;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_inv IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount_paise),0) INTO v_paid
    FROM public.payments WHERE invoice_id = NEW.invoice_id AND status = 'CAPTURED';
  UPDATE public.invoices SET
    paid_paise = v_paid,
    balance_paise = GREATEST(v_inv.total_paise - v_paid, 0),
    status = CASE
      WHEN v_paid >= v_inv.total_paise THEN 'PAID'
      WHEN v_paid > 0 THEN 'PARTIALLY_PAID'
      WHEN v_inv.due_date < CURRENT_DATE THEN 'OVERDUE'
      ELSE v_inv.status
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_payments_recalc_invoice AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_invoice_status();

CREATE OR REPLACE FUNCTION public.fn_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'INV-' || to_char(now(),'YYMM') || '-';
  SELECT COUNT(*)+1 INTO v_count FROM public.invoices
    WHERE property_id = NEW.property_id AND invoice_number LIKE v_prefix || '%';
  NEW.invoice_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_number BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_number();

CREATE OR REPLACE FUNCTION public.fn_payment_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.payment_number IS NOT NULL AND NEW.payment_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'PMT-' || to_char(now(),'YYMM') || '-';
  SELECT COUNT(*)+1 INTO v_count FROM public.payments
    WHERE property_id = NEW.property_id AND payment_number LIKE v_prefix || '%';
  NEW.payment_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_payment_number BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_number();

CREATE OR REPLACE FUNCTION public.fn_refund_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.refund_number IS NOT NULL AND NEW.refund_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'RFD-' || to_char(now(),'YYMM') || '-';
  SELECT COUNT(*)+1 INTO v_count FROM public.refunds
    WHERE property_id = NEW.property_id AND refund_number LIKE v_prefix || '%';
  NEW.refund_number := v_prefix || lpad(v_count::text,4,'0');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_refund_number BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refund_number();

-- fn_generate_invoices
CREATE OR REPLACE FUNCTION public.fn_generate_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; comp record;
  v_subtotal bigint; v_tax bigint;
  v_period_start date; v_period_end date; v_due date;
  v_inserted int := 0;
  v_today date := CURRENT_DATE;
BEGIN
  FOR r IN
    SELECT a.id AS allocation_id, a.tenant_id, a.property_id, a.student_id, a.fee_plan_id,
           a.billing_cycle_day, fp.due_day, fp.billing_frequency, fp.grace_period_days
    FROM public.allocations a
    JOIN public.fee_plans fp ON fp.id = a.fee_plan_id
    WHERE a.status = 'ACTIVE' AND a.deleted_at IS NULL
      AND fp.status = 'ACTIVE' AND fp.deleted_at IS NULL
      AND EXTRACT(DAY FROM v_today)::int = COALESCE(a.billing_cycle_day, fp.due_day)
      AND fp.effective_from <= v_today
      AND (fp.effective_until IS NULL OR fp.effective_until >= v_today)
  LOOP
    v_period_start := date_trunc('month', v_today)::date;
    v_period_end := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
    v_due := v_today + make_interval(days => COALESCE(r.grace_period_days,0));
    v_subtotal := 0; v_tax := 0;
    FOR comp IN
      SELECT * FROM public.fee_plan_components
      WHERE fee_plan_id = r.fee_plan_id AND is_active
        AND component_type IN ('RENT','MESS','MAINTENANCE','OTHER')
    LOOP
      v_subtotal := v_subtotal + comp.amount_paise;
      IF comp.is_taxable THEN
        v_tax := v_tax + (comp.amount_paise * comp.tax_rate_basis_points / 10000);
      END IF;
    END LOOP;
    IF v_subtotal = 0 THEN CONTINUE; END IF;
    BEGIN
      INSERT INTO public.invoices (
        tenant_id, property_id, student_id, allocation_id, fee_plan_id,
        billing_period_start, billing_period_end, issue_date, due_date, status,
        subtotal_paise, discount_paise, tax_paise, late_fee_paise, total_paise,
        paid_paise, refunded_paise, balance_paise, issued_at
      ) VALUES (
        r.tenant_id, r.property_id, r.student_id, r.allocation_id, r.fee_plan_id,
        v_period_start, v_period_end, v_today, v_due, 'ISSUED',
        v_subtotal, 0, v_tax, 0, v_subtotal + v_tax,
        0, 0, v_subtotal + v_tax, now()
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RETURN v_inserted;
END $$;

CREATE OR REPLACE FUNCTION public.fn_approve_refund(p_refund_id uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS public.refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.refunds; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'p_decision must be APPROVED or REJECTED'; END IF;
  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.is_hostel_admin(v_uid, v_r.tenant_id, v_r.property_id) THEN
    RAISE EXCEPTION 'Only HOSTEL_ADMIN may approve/reject refunds';
  END IF;
  IF v_r.status NOT IN ('PENDING_APPROVAL','DRAFT') THEN
    RAISE EXCEPTION 'Refund is not pending approval (status=%)', v_r.status;
  END IF;
  IF p_decision = 'APPROVED' AND v_r.initiated_by = v_uid THEN
    RAISE EXCEPTION 'Self-approval blocked';
  END IF;
  UPDATE public.refunds SET
    status = p_decision, approved_by = v_uid, approved_at = now(), decision_reason = p_reason
  WHERE id = p_refund_id RETURNING * INTO v_r;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_approve_refund(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_approve_refund(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.provisional_refund_paise(p_allocation_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_deposit bigint; v_dues bigint;
BEGIN
  SELECT deposit_snapshot_paise INTO v_deposit FROM public.allocations WHERE id = p_allocation_id;
  SELECT COALESCE(SUM(balance_paise),0) INTO v_dues FROM public.invoices
    WHERE allocation_id = p_allocation_id AND status NOT IN ('VOID','PAID','REFUNDED') AND deleted_at IS NULL;
  RETURN GREATEST(COALESCE(v_deposit,0) - COALESCE(v_dues,0), 0);
END $$;

-- Storage policies for receipts bucket
CREATE POLICY "receipts_finance_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');

-- pg_cron daily invoice generator
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('generate-invoices-daily');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('generate-invoices-daily','0 3 * * *','SELECT public.fn_generate_invoices();');
  END IF;
END $$;
