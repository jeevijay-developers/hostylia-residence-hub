-- Students tab: admin admission / charge / status / notice flows.
--
-- Everything the property "Students" tab writes goes through one of these RPCs
-- so a multi-step action (student + guardian + bed + agreement + opening dues +
-- offline payment) is ONE transaction, and student status only ever moves along
-- a valid lifecycle edge — never a raw `students.status` update from the client.
--
--   1. fn_register_student      + trailing p_guardian_email (fills a matched
--                                 guardian's email only when it is still NULL).
--   2. fn_invoice_number()      advisory lock + SECURITY DEFINER (same race /
--                                 RLS-undercount fixes payments and gate passes got).
--   3. fn_add_student_charge    one-off ISSUED "Opening dues" invoice, optionally
--                                 paid offline via record_manual_payment.
--   4. fn_admit_student         register + optional VERIFIED + optional bed
--                                 (PENDING_AGREEMENT allocation + SENT agreement)
--                                 + optional opening dues/payment.
--   5. fn_set_student_review_status  APPLICANT <-> VERIFIED, -> REJECTED, REJECTED -> APPLICANT.
--   6. fn_staff_give_notice     staff records a notice the student gave in person.
--   7. Index for the property KYC approvals queue.
--
-- fn_add_student_charge / fn_admit_student are SECURITY INVOKER: the caller's own
-- RLS applies to every insert (students: can_create_students, invoices:
-- can_create_invoices, allocations / agreements: the allocation policies), with
-- explicit checks up front only to turn a bare RLS violation into a clear message.
-- ACTIVE is never set here: it still happens only when the student signs the
-- agreement and the first invoice is paid (activate_allocation).

-- ---------------------------------------------------------------------------
-- 1. fn_register_student: + p_guardian_email (latest body: 20261106090000)
-- ---------------------------------------------------------------------------
-- Dropped first so the 17-arg version cannot linger as an overload; existing
-- named-argument callers resolve to the new signature through the default.
DROP FUNCTION IF EXISTS public.fn_register_student(
  uuid, uuid, text, text, text, text, date, text, text, text, text, boolean, jsonb, text, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.fn_register_student(
  p_tenant_id uuid, p_property_id uuid, p_admission_number text, p_full_name text,
  p_phone text, p_email text, p_date_of_birth date, p_gender text,
  p_academic_institute text, p_course_name text, p_academic_year text,
  p_is_minor boolean, p_metadata jsonb,
  p_guardian_name text, p_guardian_phone text, p_guardian_relationship text, p_guardian_is_emergency boolean,
  p_guardian_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
  v_guardian_id uuid;
  v_guardian_email text := NULLIF(btrim(p_guardian_email), '');
BEGIN
  INSERT INTO public.students (
    tenant_id, property_id, admission_number, full_name, phone, email, date_of_birth, gender,
    academic_institute, course_name, academic_year, is_minor, status, metadata
  ) VALUES (
    p_tenant_id, p_property_id, p_admission_number, p_full_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_email), ''),
    p_date_of_birth, NULLIF(btrim(p_gender), ''), NULLIF(btrim(p_academic_institute), ''), NULLIF(btrim(p_course_name), ''),
    NULLIF(btrim(p_academic_year), ''), coalesce(p_is_minor, false), 'APPLICANT', coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_student_id;

  IF NULLIF(btrim(p_guardian_phone), '') IS NOT NULL AND NULLIF(btrim(p_guardian_name), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('guardian:' || p_tenant_id || ':' || p_guardian_phone, 0));
    SELECT id INTO v_guardian_id FROM public.guardians
     WHERE tenant_id = p_tenant_id AND phone = p_guardian_phone ORDER BY created_at LIMIT 1;
    IF v_guardian_id IS NULL THEN
      INSERT INTO public.guardians (tenant_id, full_name, phone, email)
      VALUES (p_tenant_id, p_guardian_name, p_guardian_phone, v_guardian_email) RETURNING id INTO v_guardian_id;
    ELSIF v_guardian_email IS NOT NULL THEN
      -- A shared guardian row is never overwritten (it may be linked to siblings);
      -- only a missing email is filled in.
      UPDATE public.guardians SET email = v_guardian_email
       WHERE id = v_guardian_id AND email IS NULL;
    END IF;
    INSERT INTO public.student_guardians (tenant_id, student_id, guardian_id, relationship, is_primary, is_emergency_contact)
    VALUES (p_tenant_id, v_student_id, v_guardian_id, coalesce(p_guardian_relationship, 'GUARDIAN'), true, coalesce(p_guardian_is_emergency, false));
  END IF;

  RETURN jsonb_build_object('id', v_student_id, 'admission_number', p_admission_number);
END $$;
REVOKE ALL ON FUNCTION public.fn_register_student(uuid, uuid, text, text, text, text, date, text, text, text, text, boolean, jsonb, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_student(uuid, uuid, text, text, text, text, date, text, text, text, text, boolean, jsonb, text, text, text, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. fn_invoice_number(): serialize per property + count every row
-- ---------------------------------------------------------------------------
-- Same COUNT(*)+1 race fixed for payments (20261201090100), refunds and gate
-- passes: bulk import / opening dues now issue many invoices back to back. And,
-- as with gate passes (20260822094121), the trigger ran SECURITY INVOKER, so the
-- COUNT only saw invoices visible to the caller's RLS; SECURITY DEFINER makes it
-- count every invoice of the property. Output format is unchanged:
-- 'INV-' || YYMM || '-' || 5-digit sequence, per property.
CREATE OR REPLACE FUNCTION public.fn_invoice_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'INV-' || to_char(now(),'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || NEW.property_id::text));
  SELECT COUNT(*)+1 INTO v_count FROM public.invoices
    WHERE property_id = NEW.property_id AND invoice_number LIKE v_prefix || '%';
  NEW.invoice_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_invoice_number() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3. fn_add_student_charge: one-off opening-dues invoice (+ optional payment)
-- ---------------------------------------------------------------------------
-- Rent and deposit are NOT billed here (they bill automatically after the
-- agreement is signed); this is for admission fee / back-dues / other one-offs.
-- The invoice is tied to the student's open allocation (if any) so move-out
-- settlement deducts it from the deposit like any other allocation invoice.
CREATE OR REPLACE FUNCTION public.fn_add_student_charge(
  p_student_id uuid,
  p_amount_paise bigint,
  p_due_date date,
  p_note text,
  p_payment_amount_paise bigint DEFAULT NULL,
  p_payment_mode text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_student public.students%ROWTYPE;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_pay_amount bigint := NULLIF(p_payment_amount_paise, 0);
  v_mode text := upper(NULLIF(btrim(coalesce(p_payment_mode, '')), ''));
  v_ref text := NULLIF(btrim(coalesce(p_payment_reference, '')), '');
  v_alloc_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_pay public.payments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise < 1 OR p_amount_paise > 1000000000 THEN
    RAISE EXCEPTION 'Amount due must be between ₹0.01 and ₹1,00,00,000' USING ERRCODE = '22023';
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date for the charge' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 200 THEN
    RAISE EXCEPTION 'Note must be 200 characters or fewer' USING ERRCODE = '22023';
  END IF;

  IF v_pay_amount IS NOT NULL THEN
    IF v_pay_amount < 0 OR v_pay_amount > p_amount_paise THEN
      RAISE EXCEPTION 'Amount received can''t be more than the amount due' USING ERRCODE = '22023';
    END IF;
    IF v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER') THEN
      RAISE EXCEPTION 'Choose a payment method (cash, UPI, bank transfer, cheque or other)' USING ERRCODE = '22023';
    END IF;
    IF v_mode IN ('UPI', 'BANK_TRANSFER', 'CHEQUE') AND v_ref IS NULL THEN
      RAISE EXCEPTION '%', CASE WHEN v_mode = 'CHEQUE' THEN 'Enter the cheque number'
                                ELSE 'Enter the transaction / UTR reference' END
        USING ERRCODE = '22023';
    END IF;
    IF v_ref IS NOT NULL AND char_length(v_ref) > 120 THEN
      RAISE EXCEPTION 'Payment reference must be 120 characters or fewer' USING ERRCODE = '22023';
    END IF;
    IF v_mode = 'CHEQUE' AND p_cheque_date IS NULL THEN
      RAISE EXCEPTION 'Enter the cheque date' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Read through the caller's RLS: another tenant's student is simply not found.
  SELECT * INTO v_student FROM public.students WHERE id = p_student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_create_invoices(v_uid, v_student.tenant_id, v_student.property_id) THEN
    RAISE EXCEPTION 'You do not have permission to add charges for this student' USING ERRCODE = '42501';
  END IF;

  IF v_pay_amount IS NOT NULL THEN
    IF NOT public.can_create_payments(v_uid, v_student.tenant_id, v_student.property_id) THEN
      RAISE EXCEPTION 'You do not have permission to record payments for this student' USING ERRCODE = '42501';
    END IF;
    -- record_manual_payment activates the student's PENDING_PAYMENT allocation on
    -- ANY payment (crediting the full deposit). That must only happen through the
    -- first invoice, never as a side effect of an opening-dues payment. Same
    -- predicate as record_manual_payment's lookup (no deleted_at filter).
    IF EXISTS (
      SELECT 1 FROM public.allocations a
      WHERE a.student_id = p_student_id AND a.status = 'PENDING_PAYMENT'
    ) THEN
      RAISE EXCEPTION 'Record the payment against the student''s first invoice from Finance before adding a paid charge'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT a.id INTO v_alloc_id
    FROM public.allocations a
   WHERE a.student_id = p_student_id AND a.deleted_at IS NULL
     AND a.status IN ('PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION')
   ORDER BY a.created_at DESC
   LIMIT 1;

  INSERT INTO public.invoices (
    tenant_id, property_id, student_id, allocation_id, fee_plan_id,
    billing_period_start, billing_period_end, invoice_number, issue_date, due_date, status,
    subtotal_paise, discount_paise, tax_paise, late_fee_paise, total_paise,
    paid_paise, refunded_paise, balance_paise, notes, issued_at, created_by
  ) VALUES (
    v_student.tenant_id, v_student.property_id, v_student.id, v_alloc_id, NULL,
    NULL, NULL, '', current_date, p_due_date, 'ISSUED',
    p_amount_paise, 0, 0, 0, p_amount_paise,
    0, 0, p_amount_paise, 'Opening dues' || coalesce(': ' || v_note, ''), now(), v_uid
  ) RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  IF v_pay_amount IS NOT NULL THEN
    SELECT * INTO v_pay FROM public.record_manual_payment(
      v_invoice_id, v_mode, v_pay_amount, v_ref,
      CASE WHEN v_mode = 'CHEQUE' THEN p_cheque_date END,
      'Recorded with opening dues'
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'payment_id', v_pay.id,
    'payment_number', v_pay.payment_number
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_add_student_charge(uuid, bigint, date, text, bigint, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_student_charge(uuid, bigint, date, text, bigint, text, text, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. fn_admit_student: the whole "Add student" modal / import row in one txn
-- ---------------------------------------------------------------------------
-- Allocation + agreement mirror createAllocation (src/lib/student.functions.ts):
-- PENDING_AGREEMENT, room/floor/block copied from the bed, billing day 1,
-- 30-day notice, SENT click-consent agreement. beds.status is never written
-- here — trg_allocations_flip_bed owns it. uidx_allocations_active_bed is the
-- final arbiter when two admissions race for the same bed.
CREATE OR REPLACE FUNCTION public.fn_admit_student(
  p_tenant_id uuid,
  p_property_id uuid,
  p_admission_number text,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_academic_institute text DEFAULT NULL,
  p_course_name text DEFAULT NULL,
  p_academic_year text DEFAULT NULL,
  p_is_minor boolean DEFAULT false,
  p_guardian_name text DEFAULT NULL,
  p_guardian_phone text DEFAULT NULL,
  p_guardian_relationship text DEFAULT NULL,
  p_guardian_email text DEFAULT NULL,
  p_initial_status text DEFAULT 'APPLICANT',
  p_bed_id uuid DEFAULT NULL,
  p_fee_plan_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_rent_paise bigint DEFAULT NULL,
  p_deposit_paise bigint DEFAULT NULL,
  p_opening_dues_paise bigint DEFAULT NULL,
  p_dues_due_date date DEFAULT NULL,
  p_dues_note text DEFAULT NULL,
  p_payment_amount_paise bigint DEFAULT NULL,
  p_payment_mode text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admission text := btrim(coalesce(p_admission_number, ''));
  v_status text := upper(btrim(coalesce(p_initial_status, 'APPLICANT')));
  v_dues bigint := coalesce(p_opening_dues_paise, 0);
  v_bed record;
  v_start date;
  v_rent bigint;
  v_deposit bigint;
  v_reg jsonb;
  v_student_id uuid;
  v_alloc_id uuid;
  v_agreement_id uuid;
  v_charge jsonb;
  v_rows int;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_tenant_role(v_uid, p_tenant_id, 'HOSTEL_ADMIN')
          OR public.can_create_students(v_uid, p_tenant_id, p_property_id)) THEN
    RAISE EXCEPTION 'You do not have permission to add students to this property' USING ERRCODE = '42501';
  END IF;
  -- A tenant-wide role passes the check above for ANY property id, so the
  -- property must be proven to belong to this tenant before anything is written.
  IF NOT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = p_property_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_admission = '' THEN
    RAISE EXCEPTION 'Admission ID is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_admission) > 40 THEN
    RAISE EXCEPTION 'Admission ID can be at most 40 characters' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('APPLICANT', 'VERIFIED') THEN
    RAISE EXCEPTION 'A new student starts as Applicant or Verified' USING ERRCODE = '22023';
  END IF;
  IF v_dues < 0 THEN
    RAISE EXCEPTION 'Opening dues cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF v_dues = 0 AND coalesce(p_payment_amount_paise, 0) <> 0 THEN
    RAISE EXCEPTION 'Enter the opening dues before recording a payment against them' USING ERRCODE = '22023';
  END IF;

  IF p_bed_id IS NOT NULL THEN
    IF p_fee_plan_id IS NULL THEN
      RAISE EXCEPTION 'Choose a fee plan for the bed allocation' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.fee_plans fp
      WHERE fp.id = p_fee_plan_id AND fp.tenant_id = p_tenant_id AND fp.property_id = p_property_id
        AND fp.status = 'ACTIVE' AND fp.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'The selected fee plan is not active for this property' USING ERRCODE = '22023';
    END IF;

    SELECT b.id, b.code, b.status, b.room_id, b.floor_id, b.block_id, b.rent_override_paise,
           r.room_number, r.status AS room_status, r.base_rent_paise
      INTO v_bed
      FROM public.beds b
      JOIN public.rooms r ON r.id = b.room_id
     WHERE b.id = p_bed_id AND b.tenant_id = p_tenant_id AND b.property_id = p_property_id
       AND b.deleted_at IS NULL AND r.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bed not found in this property' USING ERRCODE = 'P0002';
    END IF;
    IF v_bed.status <> 'VACANT' THEN
      RAISE EXCEPTION 'Bed % in room % is not vacant', v_bed.code, v_bed.room_number USING ERRCODE = '55000';
    END IF;
    IF v_bed.room_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Bed % in room % is not vacant (room is %)', v_bed.code, v_bed.room_number, lower(v_bed.room_status)
        USING ERRCODE = '55000';
    END IF;

    v_start := coalesce(p_start_date, current_date);
    v_rent := coalesce(
      p_rent_paise, v_bed.rent_override_paise, v_bed.base_rent_paise,
      (SELECT sum(c.amount_paise) FROM public.fee_plan_components c
        WHERE c.fee_plan_id = p_fee_plan_id AND c.is_active AND c.component_type = 'RENT'),
      0);
    v_deposit := coalesce(
      p_deposit_paise,
      (SELECT sum(c.amount_paise) FROM public.fee_plan_components c
        WHERE c.fee_plan_id = p_fee_plan_id AND c.is_active AND c.component_type = 'DEPOSIT'),
      0);
    IF v_rent < 0 OR v_rent > 1000000000 OR v_deposit < 0 OR v_deposit > 1000000000 THEN
      RAISE EXCEPTION 'Rent and deposit must be between ₹0 and ₹1,00,00,000' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_reg := public.fn_register_student(
    p_tenant_id => p_tenant_id,
    p_property_id => p_property_id,
    p_admission_number => v_admission,
    p_full_name => btrim(p_full_name),
    p_phone => p_phone,
    p_email => p_email,
    p_date_of_birth => p_date_of_birth,
    p_gender => p_gender,
    p_academic_institute => p_academic_institute,
    p_course_name => p_course_name,
    p_academic_year => p_academic_year,
    p_is_minor => coalesce(p_is_minor, false),
    p_metadata => NULL,
    p_guardian_name => p_guardian_name,
    p_guardian_phone => p_guardian_phone,
    p_guardian_relationship => NULLIF(btrim(coalesce(p_guardian_relationship, '')), ''),
    p_guardian_is_emergency => true,
    p_guardian_email => p_guardian_email
  );
  v_student_id := (v_reg ->> 'id')::uuid;

  IF v_status = 'VERIFIED' THEN
    UPDATE public.students
       SET status = 'VERIFIED',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('review', jsonb_build_object(
             'status', 'VERIFIED', 'reason', NULL, 'at', now(), 'by', v_uid))
     WHERE id = v_student_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    -- RLS silently filters an UPDATE the caller may not make (create-only staff).
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'You do not have permission to mark students as verified' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_bed_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.allocations (
        tenant_id, property_id, student_id, bed_id, room_id, floor_id, block_id, fee_plan_id,
        status, start_date, rent_snapshot_paise, deposit_snapshot_paise,
        billing_cycle_day, notice_period_days, created_by
      ) VALUES (
        p_tenant_id, p_property_id, v_student_id, v_bed.id, v_bed.room_id, v_bed.floor_id, v_bed.block_id, p_fee_plan_id,
        'PENDING_AGREEMENT', v_start, v_rent, v_deposit,
        1, 30, v_uid
      ) RETURNING id INTO v_alloc_id;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uidx_allocations_active_bed' THEN
        RAISE EXCEPTION 'Bed % in room % is not vacant', v_bed.code, v_bed.room_number USING ERRCODE = '55000';
      END IF;
      RAISE;
    END;

    INSERT INTO public.agreements (
      tenant_id, property_id, student_id, allocation_id, template_version, status, sent_at, signature_method, created_by
    ) VALUES (
      p_tenant_id, p_property_id, v_student_id, v_alloc_id, 'v1', 'SENT', now(), 'CLICK_CONSENT', v_uid
    ) RETURNING id INTO v_agreement_id;

    UPDATE public.allocations SET agreement_id = v_agreement_id WHERE id = v_alloc_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'You do not have permission to allocate beds in this property' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_dues > 0 THEN
    v_charge := public.fn_add_student_charge(
      p_student_id => v_student_id,
      p_amount_paise => v_dues,
      p_due_date => coalesce(p_dues_due_date, current_date),
      p_note => p_dues_note,
      p_payment_amount_paise => p_payment_amount_paise,
      p_payment_mode => p_payment_mode,
      p_payment_reference => p_payment_reference,
      p_cheque_date => p_cheque_date
    );
  END IF;

  RETURN jsonb_build_object(
    'student_id', v_student_id,
    'admission_number', v_admission,
    'allocation_id', v_alloc_id,
    'agreement_id', v_agreement_id,
    'invoice_id', v_charge -> 'invoice_id',
    'invoice_number', v_charge -> 'invoice_number',
    'payment_id', v_charge -> 'payment_id',
    'payment_number', v_charge -> 'payment_number'
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_admit_student(
  uuid, uuid, text, text, text, text, date, text, text, text, text, boolean,
  text, text, text, text, text, uuid, uuid, date, bigint, bigint, bigint, date, text, bigint, text, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admit_student(
  uuid, uuid, text, text, text, text, date, text, text, text, text, boolean,
  text, text, text, text, text, uuid, uuid, date, bigint, bigint, bigint, date, text, bigint, text, text, date
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. fn_set_student_review_status: the only staff path for review statuses
-- ---------------------------------------------------------------------------
-- Allowed edges: APPLICANT -> VERIFIED, VERIFIED -> APPLICANT,
-- APPLICANT | VERIFIED -> REJECTED (reason, no open allocation), REJECTED -> APPLICANT.
-- The latest decision is kept in students.metadata->'review' for display; the
-- durable record is the audit_logs row.
CREATE OR REPLACE FUNCTION public.fn_set_student_review_status(
  p_student_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s public.students%ROWTYPE;
  v_target text := upper(btrim(coalesce(p_status, '')));
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.students WHERE id = p_student_id FOR UPDATE;
  -- Not-found and not-authorized look the same, so another tenant can't probe ids.
  IF NOT FOUND OR NOT (
    public.has_tenant_role(v_uid, v_s.tenant_id, 'HOSTEL_ADMIN')
    OR public.can_edit_students(v_uid, v_s.tenant_id, v_s.property_id)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change this student''s status' USING ERRCODE = '42501';
  END IF;
  IF v_s.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This student is archived' USING ERRCODE = '55000';
  END IF;

  IF v_target NOT IN ('APPLICANT', 'VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'Status % can''t be set here. Active, notice and move-out follow the bed allocation.', v_target
      USING ERRCODE = '23514';
  END IF;
  IF v_s.status = v_target THEN
    RAISE EXCEPTION 'Student is already %', lower(v_target) USING ERRCODE = '23514';
  END IF;

  v_allowed := CASE v_s.status
    WHEN 'APPLICANT' THEN v_target IN ('VERIFIED', 'REJECTED')
    WHEN 'VERIFIED'  THEN v_target IN ('APPLICANT', 'REJECTED')
    WHEN 'REJECTED'  THEN v_target = 'APPLICANT'
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'A % student can''t be moved to % from here', lower(replace(v_s.status, '_', ' ')), lower(v_target)
      USING ERRCODE = '23514';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer' USING ERRCODE = '23514';
  END IF;
  IF v_target = 'REJECTED' THEN
    IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
      RAISE EXCEPTION 'Give a reason for rejecting (at least 3 characters)' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.allocations a
      WHERE a.student_id = v_s.id AND a.deleted_at IS NULL
        AND a.status IN ('PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION')
    ) THEN
      RAISE EXCEPTION 'This student has a bed allocation. Cancel it before rejecting the student.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.students
     SET status = v_target,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('review', jsonb_build_object(
           'status', v_target, 'reason', v_reason, 'at', now(), 'by', v_uid))
   WHERE id = v_s.id;

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_s.tenant_id, v_s.property_id, v_uid, 'STUDENT_STATUS_CHANGED', 'students', v_s.id,
          jsonb_build_object('status', v_s.status, 'review', v_s.metadata -> 'review'),
          jsonb_build_object('status', v_target, 'reason', v_reason));
END $$;
REVOKE ALL ON FUNCTION public.fn_set_student_review_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_student_review_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. fn_staff_give_notice: staff record a notice the student gave in person
-- ---------------------------------------------------------------------------
-- Same rules and side effects as give_notice() (20261030100000 §10): ACTIVE
-- only, single notice, date >= GREATEST(lock-in, IST today + notice period),
-- reason 3-500, bed stays OCCUPIED, same notification fan-out. Staff are not
-- subject to the student self-update guard, so no hostylia.notice_flow flag.
CREATE OR REPLACE FUNCTION public.fn_staff_give_notice(
  p_allocation_id uuid,
  p_requested_move_out_date date,
  p_reason text,
  p_remarks text DEFAULT NULL
) RETURNS public.allocations
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_alloc public.allocations;
  v_student record;
  v_earliest date;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_remarks text := NULLIF(btrim(coalesce(p_remarks, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM public.allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.has_tenant_role(v_uid, v_alloc.tenant_id, 'HOSTEL_ADMIN')
    OR public.can_edit_allocations(v_uid, v_alloc.tenant_id, v_alloc.property_id, v_alloc.block_id)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to record a notice for this allocation' USING ERRCODE = '42501';
  END IF;
  IF v_alloc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Allocation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.profile_id, s.full_name INTO v_student
    FROM public.students s
   WHERE s.id = v_alloc.student_id AND s.deleted_at IS NULL;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
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

  PERFORM public.fn_notify_move_out_event(
    v_alloc.tenant_id, v_alloc.property_id, v_alloc.block_id, v_student.profile_id,
    'MOVE_OUT_NOTICE_SUBMITTED',
    'move_out_notice:' || p_allocation_id || ':' || floor(extract(epoch FROM v_alloc.notice_given_at) * 1000)::bigint,
    'Move-out notice recorded',
    format('A move-out notice for %s on %s was recorded by staff. Reason: %s', v_student.full_name, p_requested_move_out_date, v_reason),
    'Notice recorded',
    format('The hostel team has recorded your move-out notice for %s.', p_requested_move_out_date),
    jsonb_build_object(
      'allocation_id', p_allocation_id, 'student_id', v_student.id,
      'requested_move_out_date', p_requested_move_out_date, 'recorded_by_staff', true)
  );

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_alloc.tenant_id, v_alloc.property_id, v_uid, 'MOVE_OUT_NOTICE_RECORDED_BY_STAFF', 'allocations', v_alloc.id,
          jsonb_build_object('status', 'ACTIVE'),
          jsonb_build_object('status', 'NOTICE_GIVEN', 'student_id', v_student.id,
                             'requested_move_out_date', p_requested_move_out_date,
                             'reason', v_reason, 'remarks', v_remarks));

  RETURN v_alloc;
END $$;
REVOKE ALL ON FUNCTION public.fn_staff_give_notice(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_staff_give_notice(uuid, date, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Property KYC approvals queue (Students tab, paginated, oldest first)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_property_kyc_pending
  ON public.documents (property_id, created_at)
  WHERE owner_type = 'STUDENT' AND verification_status = 'PENDING' AND deleted_at IS NULL;
