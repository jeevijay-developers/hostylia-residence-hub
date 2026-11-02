-- Student "Give Notice" -> staff review -> move-out workflow, plus the
-- security hardening it depends on.
--
-- Verified against the LIVE database (read-only catalog queries) before
-- writing: complete_move_out(uuid, date) and activate_allocation(uuid) were
-- SECURITY DEFINER, EXECUTE-granted to `authenticated`, with no role / tenant /
-- property check at all — any logged-in user (including a Student or another
-- tenant's user) who knew an allocation id could move it out / activate it.
--
-- What this migration does
--   1. Notice columns on allocations; deposit_adjusted_paise on invoices.
--   2. fn_recalc_invoice_status now subtracts deposit_adjusted_paise, so an
--      invoice settled from the deposit stays settled when payments recompute
--      it (paid_paise is always re-derived from CAPTURED payments; no fake
--      payment rows are ever created).
--   3. complete_move_out(): authorization + state/date validation, invoice-wise
--      deposit deduction capped at the REAL ledger balance, invoice balances
--      updated in the same transaction, shortfall left outstanding on the
--      invoices, bed released through the existing allocation trigger only.
--   4. activate_allocation(): service_role (fail-closed) or payment staff only.
--   5. give_notice(): student-owned, ACTIVE -> NOTICE_GIVEN, bed untouched.
--   6. move_out_settlement(): read-only invoice-wise dues / deposit / refundable
--      breakdown for the wizard and the refund step.
--   7. earliest_move_out_date(): notice period counts from notice_given_at.
--   8. DB guards: deposit DEBITs and deposit refunds can never exceed the real
--      ledger balance (also under concurrency).
--   9. Notifications (tenant-scoped, idempotent) via the existing
--      `notifications` table.
-- Signatures and EXECUTE grants of the existing RPCs are preserved.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.allocations
  ADD COLUMN IF NOT EXISTS notice_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_move_out_date date,
  ADD COLUMN IF NOT EXISTS notice_reason text,
  ADD COLUMN IF NOT EXISTS notice_remarks text;

COMMENT ON COLUMN public.allocations.notice_given_at IS
  'Set once by give_notice(); the notice period and earliest_move_out_date() count from here.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deposit_adjusted_paise bigint NOT NULL DEFAULT 0
    CHECK (deposit_adjusted_paise >= 0);

COMMENT ON COLUMN public.invoices.deposit_adjusted_paise IS
  'Amount of this invoice settled by deduction from the security deposit at move-out (see complete_move_out). balance_paise = total - paid (captured payments) - deposit_adjusted.';

-- ---------------------------------------------------------------------------
-- 2. Invoice recompute honours deposit adjustments
-- ---------------------------------------------------------------------------
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
    balance_paise = GREATEST(v_inv.total_paise - v_paid - v_inv.deposit_adjusted_paise, 0),
    status = CASE
      WHEN v_paid + v_inv.deposit_adjusted_paise >= v_inv.total_paise THEN 'PAID'
      WHEN v_paid + v_inv.deposit_adjusted_paise > 0 THEN 'PARTIALLY_PAID'
      WHEN v_inv.due_date < CURRENT_DATE THEN 'OVERDUE'
      ELSE v_inv.status
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers (not callable by API roles)
-- ---------------------------------------------------------------------------
-- Fail-closed service-role check: a missing, empty or malformed JWT role claim
-- yields false, never true.
CREATE OR REPLACE FUNCTION public.fn_is_service_role()
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  RETURN COALESCE(auth.role(), '') = 'service_role';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.fn_is_service_role() FROM PUBLIC, anon, authenticated;

-- Staff who should hear about a move-out event: Hostel Admins of the tenant
-- (property-scoped admins only for their property) and Wardens whose scope
-- covers the property/block with allocations_edit. Plus the student, if they
-- have a portal login. One row per recipient per p_key (idempotent).
CREATE OR REPLACE FUNCTION public.fn_notify_move_out_event(
  p_tenant_id uuid, p_property_id uuid, p_block_id uuid, p_student_profile_id uuid,
  p_event text, p_key text,
  p_staff_title text, p_staff_body text,
  p_student_title text, p_student_body text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recipient uuid;
BEGIN
  FOR v_recipient IN
    SELECT DISTINCT ra.user_id FROM public.role_assignments ra
    WHERE ra.tenant_id = p_tenant_id AND ra.is_active = true
      AND (
        (ra.role = 'HOSTEL_ADMIN' AND (ra.property_id IS NULL OR ra.property_id = p_property_id))
        OR (ra.role = 'WARDEN'
            AND public.can_edit_allocations(ra.user_id, p_tenant_id, p_property_id, p_block_id))
      )
  LOOP
    INSERT INTO public.notifications (
      tenant_id, property_id, recipient_user_id, event_type, channel,
      template_key, payload, status, sent_at, delivered_at, idempotency_key
    ) VALUES (
      p_tenant_id, p_property_id, v_recipient, p_event, 'IN_APP',
      lower(p_event),
      p_payload || jsonb_build_object('title', p_staff_title, 'body', p_staff_body),
      'DELIVERED', now(), now(), p_key || ':' || v_recipient
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END LOOP;

  IF p_student_profile_id IS NOT NULL AND p_student_title IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, property_id, recipient_user_id, event_type, channel,
      template_key, payload, status, sent_at, delivered_at, idempotency_key
    ) VALUES (
      p_tenant_id, p_property_id, p_student_profile_id, p_event, 'IN_APP',
      lower(p_event) || '_student',
      p_payload || jsonb_build_object('title', p_student_title, 'body', p_student_body),
      'DELIVERED', now(), now(), p_key || ':student'
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_notify_move_out_event(uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deposit ledger / refund guards (balance can never go negative)
-- ---------------------------------------------------------------------------
-- Serialises per allocation so a move-out deduction and a refund completion
-- racing each other cannot both spend the same deposit.
CREATE OR REPLACE FUNCTION public.fn_deposit_ledger_guard_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance bigint;
BEGIN
  IF NEW.direction = 'DEBIT' AND NEW.entry_type IN ('DEDUCTION', 'REFUND_COMPLETED') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('deposit-ledger:' || NEW.allocation_id::text, 0));
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
      INTO v_balance FROM public.deposit_ledger_entries WHERE allocation_id = NEW.allocation_id;
    IF NEW.amount_paise > v_balance THEN
      RAISE EXCEPTION 'Deposit debit (%) exceeds the available deposit ledger balance (%)',
        NEW.amount_paise, v_balance;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_deposit_ledger_guard_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deposit_ledger_guard_balance ON public.deposit_ledger_entries;
CREATE TRIGGER trg_deposit_ledger_guard_balance
  BEFORE INSERT ON public.deposit_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_deposit_ledger_guard_balance();

-- A deposit refund (requires_deposit_clearance + allocation_id, as written by
-- initiateRefund for move-out) must reference this student's own allocation and
-- payment, and together with other in-flight deposit refunds cannot exceed the
-- real ledger balance. No payment rows are ever invented: refunds.payment_id
-- stays a real, student-owned, captured payment.
CREATE OR REPLACE FUNCTION public.fn_refunds_guard_deposit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance bigint;
  v_in_flight bigint;
  v_alloc_student uuid;
  v_alloc_tenant uuid;
  v_pay_student uuid;
  v_pay_status text;
BEGIN
  IF NEW.allocation_id IS NULL OR NOT NEW.requires_deposit_clearance THEN
    RETURN NEW;
  END IF;

  SELECT student_id, tenant_id INTO v_alloc_student, v_alloc_tenant
    FROM public.allocations WHERE id = NEW.allocation_id;
  IF v_alloc_student IS NULL OR v_alloc_student <> NEW.student_id OR v_alloc_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Deposit refund allocation does not belong to this student';
  END IF;

  SELECT student_id, status INTO v_pay_student, v_pay_status
    FROM public.payments WHERE id = NEW.payment_id;
  IF v_pay_student IS DISTINCT FROM NEW.student_id OR v_pay_status NOT IN ('CAPTURED', 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION 'Deposit refund must reference a captured payment made by this student';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('deposit-ledger:' || NEW.allocation_id::text, 0));
  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
    INTO v_balance FROM public.deposit_ledger_entries WHERE allocation_id = NEW.allocation_id;
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_in_flight
    FROM public.refunds
    WHERE allocation_id = NEW.allocation_id
      AND requires_deposit_clearance
      AND id <> NEW.id
      AND status IN ('DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING');

  IF v_in_flight + NEW.amount_paise > v_balance THEN
    RAISE EXCEPTION 'Deposit refund exceeds the available deposit balance (balance %, already in flight %)',
      v_balance, v_in_flight;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_refunds_guard_deposit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refunds_guard_deposit ON public.refunds;
CREATE TRIGGER trg_refunds_guard_deposit
  BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refunds_guard_deposit();

-- ---------------------------------------------------------------------------
-- 5. Notice period starts at notice_given_at (not "today") — opening the
--    preview no longer pushes the earliest date forward.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.earliest_move_out_date(p_allocation_id uuid)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_lock date; v_notice int; v_notice_at timestamptz; v_base date;
BEGIN
  SELECT lock_in_until, COALESCE(notice_period_days, 0), notice_given_at
    INTO v_lock, v_notice, v_notice_at
    FROM public.allocations WHERE id = p_allocation_id;
  v_base := COALESCE((v_notice_at AT TIME ZONE 'Asia/Kolkata')::date,
                     (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_lock IS NULL THEN
    RETURN v_base + v_notice;
  END IF;
  RETURN GREATEST(v_lock, v_base + v_notice);
END $$;

-- Provisional refund = real ledger balance - dues the deposit will absorb -
-- deposit refunds already in flight (DRAFT invoices are not owed yet).
CREATE OR REPLACE FUNCTION public.provisional_refund_paise(p_allocation_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_balance bigint; v_dues bigint; v_in_flight bigint;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
    INTO v_balance
    FROM public.deposit_ledger_entries
    WHERE allocation_id = p_allocation_id;
  SELECT COALESCE(SUM(balance_paise), 0) INTO v_dues FROM public.invoices
    WHERE allocation_id = p_allocation_id
      AND status NOT IN ('DRAFT', 'VOID', 'PAID', 'REFUNDED') AND deleted_at IS NULL;
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_in_flight FROM public.refunds
    WHERE allocation_id = p_allocation_id AND requires_deposit_clearance
      AND status IN ('DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING');
  RETURN GREATEST(v_balance - LEAST(v_balance, v_dues) - v_in_flight, 0);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Settlement preview (read-only, invoice-wise)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_out_settlement(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a record;
  v_balance bigint;
  v_available bigint;
  v_dues bigint;
  v_deduct bigint;
  v_in_flight bigint;
  v_invoices jsonb;
BEGIN
  SELECT tenant_id, property_id, block_id INTO v_a FROM public.allocations WHERE id = p_allocation_id;
  IF v_a.tenant_id IS NULL
     OR NOT (
       public.fn_is_service_role()
       OR (v_uid IS NOT NULL AND (
            public.has_tenant_role(v_uid, v_a.tenant_id, 'HOSTEL_ADMIN')
            OR public.can_edit_allocations(v_uid, v_a.tenant_id, v_a.property_id, v_a.block_id)
            OR public.can_manage_refunds(v_uid, v_a.tenant_id, v_a.property_id)))
     ) THEN
    RAISE EXCEPTION 'Not authorized to view this move-out settlement' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
    INTO v_balance FROM public.deposit_ledger_entries WHERE allocation_id = p_allocation_id;
  v_available := GREATEST(v_balance, 0);

  WITH inv AS (
    SELECT id, invoice_number, due_date, status, balance_paise,
           COALESCE(SUM(balance_paise) OVER (
             ORDER BY due_date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS prior
    FROM public.invoices
    WHERE allocation_id = p_allocation_id AND deleted_at IS NULL AND balance_paise > 0
      AND status NOT IN ('DRAFT', 'VOID', 'PAID', 'REFUNDED')
  ), plan AS (
    SELECT *, LEAST(balance_paise, GREATEST(v_available - prior, 0)) AS deduct FROM inv
  )
  SELECT COALESCE(SUM(balance_paise), 0), COALESCE(SUM(deduct), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'invoice_number', invoice_number, 'due_date', due_date, 'status', status,
           'balance_paise', balance_paise, 'deduct_paise', deduct) ORDER BY due_date, id), '[]'::jsonb)
    INTO v_dues, v_deduct, v_invoices FROM plan;

  SELECT COALESCE(SUM(amount_paise), 0) INTO v_in_flight FROM public.refunds
    WHERE allocation_id = p_allocation_id AND requires_deposit_clearance
      AND status IN ('DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING');

  RETURN jsonb_build_object(
    'allocation_id', p_allocation_id,
    'deposit_balance_paise', v_balance,
    'total_dues_paise', v_dues,
    'planned_deduction_paise', v_deduct,
    'shortfall_paise', v_dues - v_deduct,
    'refund_in_flight_paise', v_in_flight,
    'refundable_paise', GREATEST(v_balance - v_deduct - v_in_flight, 0),
    'invoices', v_invoices
  );
END $$;
REVOKE ALL ON FUNCTION public.move_out_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_out_settlement(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. complete_move_out — secured + invoice-wise deposit settlement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_move_out(p_allocation_id uuid, p_actual_end_date date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_scope record;
  v_alloc public.allocations;
  v_student record;
  v_balance bigint;
  v_available bigint;
  v_inv record;
  v_take bigint;
  v_dues bigint := 0;
  v_deducted bigint := 0;
BEGIN
  IF p_allocation_id IS NULL OR p_actual_end_date IS NULL THEN
    RAISE EXCEPTION 'Allocation and actual move-out date are required';
  END IF;

  -- Authorize BEFORE locking or revealing anything. Unknown id and
  -- unauthorized caller get the same error so ids cannot be probed.
  SELECT tenant_id, property_id, block_id INTO v_scope
    FROM public.allocations WHERE id = p_allocation_id;
  IF v_scope.tenant_id IS NULL OR NOT (
       public.fn_is_service_role()
       OR (v_uid IS NOT NULL AND (
            public.has_tenant_role(v_uid, v_scope.tenant_id, 'HOSTEL_ADMIN')
            OR public.can_edit_allocations(v_uid, v_scope.tenant_id, v_scope.property_id, v_scope.block_id)))
     ) THEN
    RAISE EXCEPTION 'Not authorized to move out this allocation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM public.allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_alloc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;
  IF v_alloc.status NOT IN ('ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION') THEN
    RAISE EXCEPTION 'Allocation is not in a movable state (status=%)', v_alloc.status;
  END IF;
  IF p_actual_end_date > v_today THEN
    RAISE EXCEPTION 'Actual move-out date cannot be in the future';
  END IF;
  IF p_actual_end_date < v_alloc.start_date THEN
    RAISE EXCEPTION 'Actual move-out date cannot be before the allocation start date (%)', v_alloc.start_date;
  END IF;
  IF v_alloc.notice_given_at IS NOT NULL
     AND p_actual_end_date < (v_alloc.notice_given_at AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Actual move-out date cannot be before the notice date';
  END IF;

  SELECT profile_id, full_name INTO v_student
    FROM public.students WHERE id = v_alloc.student_id FOR UPDATE;

  -- Serialise with refund completion / other deposit spends for this allocation.
  PERFORM pg_advisory_xact_lock(hashtextextended('deposit-ledger:' || p_allocation_id::text, 0));
  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
    INTO v_balance FROM public.deposit_ledger_entries WHERE allocation_id = p_allocation_id;
  v_available := GREATEST(v_balance, 0);

  -- Invoice-wise settlement, oldest due first. The deduction can never exceed
  -- the real ledger balance; whatever the deposit cannot cover stays on the
  -- invoice as outstanding (never discarded, never blocks the move-out).
  FOR v_inv IN
    SELECT id, invoice_number, balance_paise
    FROM public.invoices
    WHERE allocation_id = p_allocation_id AND deleted_at IS NULL AND balance_paise > 0
      AND status NOT IN ('DRAFT', 'VOID', 'PAID', 'REFUNDED')
    ORDER BY due_date, created_at, id
    FOR UPDATE
  LOOP
    v_dues := v_dues + v_inv.balance_paise;
    v_take := LEAST(v_inv.balance_paise, v_available);
    IF v_take > 0 THEN
      UPDATE public.invoices SET
        deposit_adjusted_paise = deposit_adjusted_paise + v_take,
        balance_paise = balance_paise - v_take,
        status = CASE WHEN balance_paise - v_take = 0 THEN 'PAID' ELSE status END,
        updated_at = now()
      WHERE id = v_inv.id;

      INSERT INTO public.deposit_ledger_entries (
        tenant_id, property_id, student_id, allocation_id,
        entry_type, amount_paise, direction, reference_type, reference_id, description, created_by
      ) VALUES (
        v_alloc.tenant_id, v_alloc.property_id, v_alloc.student_id, p_allocation_id,
        'DEDUCTION', v_take, 'DEBIT', 'INVOICE', v_inv.id,
        format('Deducted from invoice %s at move-out (%s)', v_inv.invoice_number, p_actual_end_date),
        v_uid
      );
      v_available := v_available - v_take;
      v_deducted := v_deducted + v_take;
    END IF;
  END LOOP;

  -- The CLOSED transition releases the bed through the existing
  -- trg_allocations_flip_bed (only if no other active allocation holds it).
  UPDATE public.allocations
    SET status = 'CLOSED', actual_end_date = p_actual_end_date, closed_at = now()
    WHERE id = p_allocation_id;

  UPDATE public.students
    SET status = 'MOVED_OUT', moved_out_at = p_actual_end_date
    WHERE id = v_alloc.student_id;

  PERFORM public.fn_notify_move_out_event(
    v_alloc.tenant_id, v_alloc.property_id, v_alloc.block_id, v_student.profile_id,
    'MOVE_OUT_COMPLETED', 'move_out_completed:' || p_allocation_id,
    'Move-out completed',
    format('%s has been moved out on %s.', v_student.full_name, p_actual_end_date),
    'Move-out completed',
    format('Your move-out has been completed as of %s. Any remaining deposit will be refunded after approval.', p_actual_end_date),
    jsonb_build_object(
      'allocation_id', p_allocation_id, 'student_id', v_alloc.student_id,
      'actual_end_date', p_actual_end_date,
      'deducted_paise', v_deducted, 'outstanding_paise', v_dues - v_deducted,
      'deposit_remaining_paise', v_available)
  );
END $$;

REVOKE ALL ON FUNCTION public.complete_move_out(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_move_out(uuid, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_move_out(uuid, date) FROM anon;

-- ---------------------------------------------------------------------------
-- 8. activate_allocation — only service_role (Razorpay webhook) or payment
--    staff (the same can_create_payments gate record_manual_payment enforces,
--    which calls this inside its own transaction as the signed-in user).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_allocation(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_scope record;
  v_student_id uuid;
  v_bed_id uuid;
  v_tenant_id uuid;
  v_property_id uuid;
  v_deposit bigint;
BEGIN
  SELECT tenant_id, property_id INTO v_scope
    FROM public.allocations WHERE id = p_allocation_id AND status = 'PENDING_PAYMENT';
  IF v_scope.tenant_id IS NULL THEN
    RETURN; -- unchanged no-op: nothing awaiting activation
  END IF;

  IF NOT (
       public.fn_is_service_role()
       OR (v_uid IS NOT NULL AND (
            public.has_tenant_role(v_uid, v_scope.tenant_id, 'HOSTEL_ADMIN')
            OR public.can_create_payments(v_uid, v_scope.tenant_id, v_scope.property_id)))
     ) THEN
    RAISE EXCEPTION 'Not authorized to activate this allocation' USING ERRCODE = '42501';
  END IF;

  SELECT student_id, bed_id, tenant_id, property_id, COALESCE(deposit_snapshot_paise, 0)
    INTO v_student_id, v_bed_id, v_tenant_id, v_property_id, v_deposit
    FROM public.allocations
    WHERE id = p_allocation_id AND status = 'PENDING_PAYMENT'
    FOR UPDATE;

  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.allocations SET status = 'ACTIVE' WHERE id = p_allocation_id;
  UPDATE public.students SET status = 'ACTIVE' WHERE id = v_student_id;
  UPDATE public.beds SET status = 'OCCUPIED' WHERE id = v_bed_id;

  IF v_deposit > 0 AND NOT EXISTS (
    SELECT 1 FROM public.deposit_ledger_entries
    WHERE allocation_id = p_allocation_id AND entry_type = 'DEPOSIT_RECEIVED'
  ) THEN
    INSERT INTO public.deposit_ledger_entries (
      tenant_id, property_id, student_id, allocation_id,
      entry_type, amount_paise, direction, reference_type, description, created_by
    ) VALUES (
      v_tenant_id, v_property_id, v_student_id, p_allocation_id,
      'DEPOSIT_RECEIVED', v_deposit, 'CREDIT', 'ALLOCATION',
      'Security deposit received at allocation activation',
      v_uid
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.activate_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_allocation(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.activate_allocation(uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- 9. Student self-update guard: allow ONLY the ACTIVE -> NOTICE_GIVEN status
--    change, and only while give_notice() holds its transaction-local flag.
--    Every other staff-controlled column stays locked exactly as before. The
--    flag is a custom GUC that API clients cannot set (PostgREST exposes no
--    set_config), and give_notice() resets it before returning.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_students_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notice_flow boolean :=
    COALESCE(current_setting('hostylia.notice_flow', true), '') = 'on'
    AND OLD.status = 'ACTIVE' AND NEW.status = 'NOTICE_GIVEN';
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    IF NEW.tenant_id       IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id     IS DISTINCT FROM OLD.property_id
    OR (NEW.status         IS DISTINCT FROM OLD.status AND NOT v_notice_flow)
    OR NEW.is_minor        IS DISTINCT FROM OLD.is_minor
    OR NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled
    OR NEW.profile_id      IS DISTINCT FROM OLD.profile_id
    OR NEW.admission_number IS DISTINCT FROM OLD.admission_number
    OR NEW.enrolled_at     IS DISTINCT FROM OLD.enrolled_at
    OR NEW.moved_out_at    IS DISTINCT FROM OLD.moved_out_at
    OR NEW.deleted_at      IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled columns on their own record';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 10. give_notice — the only way a student moves their allocation to
--     NOTICE_GIVEN. Ownership-checked, ACTIVE-only, single notice, bed stays
--     OCCUPIED (only status + notice details change; the allocation is NOT
--     closed and trg_allocations_flip_bed leaves the bed alone).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.give_notice(
  p_allocation_id uuid,
  p_requested_move_out_date date,
  p_reason text,
  p_remarks text DEFAULT NULL
) RETURNS public.allocations
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_student record;
  v_alloc public.allocations;
  v_earliest date;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_remarks text := NULLIF(btrim(COALESCE(p_remarks, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ownership: the allocation must belong to the caller's own student record.
  SELECT s.id, s.profile_id, s.full_name INTO v_student
    FROM public.students s
    JOIN public.allocations a ON a.student_id = s.id
    WHERE a.id = p_allocation_id AND s.profile_id = v_uid AND s.deleted_at IS NULL;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'You can only give notice for your own allocation' USING ERRCODE = '42501';
  END IF;

  IF p_requested_move_out_date IS NULL THEN
    RAISE EXCEPTION 'Proposed move-out date is required';
  END IF;
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reason for leaving is required (3-500 characters)';
  END IF;
  IF v_remarks IS NOT NULL AND char_length(v_remarks) > 1000 THEN
    RAISE EXCEPTION 'Remarks must be 1000 characters or fewer';
  END IF;

  SELECT * INTO v_alloc FROM public.allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_alloc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;
  IF v_alloc.status = 'NOTICE_GIVEN' THEN
    RAISE EXCEPTION 'A move-out notice has already been submitted for this allocation';
  END IF;
  IF v_alloc.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Notice can only be given for an active allocation (status=%)', v_alloc.status;
  END IF;

  v_earliest := GREATEST(COALESCE(v_alloc.lock_in_until, v_today),
                         v_today + COALESCE(v_alloc.notice_period_days, 0));
  IF p_requested_move_out_date < v_earliest THEN
    RAISE EXCEPTION 'Proposed move-out date must be on or after % (notice period / lock-in)', v_earliest;
  END IF;

  PERFORM set_config('hostylia.notice_flow', 'on', true);
  UPDATE public.allocations SET
    status = 'NOTICE_GIVEN',
    notice_given_at = now(),
    requested_move_out_date = p_requested_move_out_date,
    notice_reason = v_reason,
    notice_remarks = v_remarks
  WHERE id = p_allocation_id
  RETURNING * INTO v_alloc;

  UPDATE public.students SET status = 'NOTICE_GIVEN'
    WHERE id = v_student.id AND status = 'ACTIVE';
  PERFORM set_config('hostylia.notice_flow', 'off', true);

  PERFORM public.fn_notify_move_out_event(
    v_alloc.tenant_id, v_alloc.property_id, v_alloc.block_id, v_student.profile_id,
    'MOVE_OUT_NOTICE_SUBMITTED',
    'move_out_notice:' || p_allocation_id || ':' || floor(extract(epoch FROM v_alloc.notice_given_at) * 1000)::bigint,
    'Move-out notice submitted',
    format('%s has given notice to move out on %s. Reason: %s', v_student.full_name, p_requested_move_out_date, v_reason),
    'Notice submitted',
    format('Your move-out notice for %s has been submitted. The hostel team will review it.', p_requested_move_out_date),
    jsonb_build_object(
      'allocation_id', p_allocation_id, 'student_id', v_student.id,
      'requested_move_out_date', p_requested_move_out_date)
  );

  RETURN v_alloc;
END $$;

REVOKE ALL ON FUNCTION public.give_notice(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.give_notice(uuid, date, text, text) TO authenticated;
