-- Refund workflow: Warden deposit/move-out verification + Accountant
-- processing (recording the transaction reference), filling the gap between
-- the existing initiate/approve steps (fn_approve_refund) and a refund
-- actually being paid out. Preserves everything already working:
--   - refunds table, its existing columns, and the DRAFT/PENDING_APPROVAL/
--     CANCELLED self-service-update path (refunds_staff_update_draft) are
--     untouched.
--   - fn_approve_refund's signature, self-approval block and HOSTEL_ADMIN
--     gate are untouched.
--   - "PROCESSED" from the brief maps to the existing "COMPLETED" status —
--     COMPLETED is the live DB CHECK constraint value, already referenced by
--     REFUND_STATUS_TONE (RefundHistoryPanel.tsx) and by the deposit ledger's
--     REFUND_COMPLETED entry_type; introducing a second, differently-spelled
--     terminal state for the same thing would fragment every existing
--     consumer instead of extending them. Flagged in the handoff report.
--
-- Full flow:
--   PENDING_VERIFICATION (only when requires_deposit_clearance) --Warden--> PENDING_APPROVAL
--   PENDING_APPROVAL --Admin (fn_approve_refund, unchanged)--> APPROVED | REJECTED
--   APPROVED --Accountant (fn_start_refund_processing)--> PROCESSING
--   PROCESSING --Accountant (fn_complete_refund)--> COMPLETED | FAILED

-- ---------------------------------------------------------------------------
-- 1. Columns: verification + processing audit trail (RULES.md 18.6 — every
--    status change must be attributable to someone, with a reason where it's
--    a decision).
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS requires_deposit_clearance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES public.allocations(id),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS processing_started_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.refunds.requires_deposit_clearance IS
  'Set by the initiating Accountant at submission. true routes the refund through PENDING_VERIFICATION (a Warden must confirm the room/key/damage deposit clearance) before it can reach PENDING_APPROVAL, and makes fn_complete_refund post a matching deposit_ledger_entries REFUND_COMPLETED row on success.';

ALTER TABLE public.refunds
  DROP CONSTRAINT refunds_status_check,
  ADD CONSTRAINT refunds_status_check CHECK (
    status = ANY (ARRAY[
      'DRAFT','PENDING_VERIFICATION','PENDING_APPROVAL','APPROVED',
      'PROCESSING','COMPLETED','REJECTED','FAILED','CANCELLED'
    ])
  );

-- Staff can insert a refund straight into PENDING_VERIFICATION now, alongside
-- the existing DRAFT/PENDING_APPROVAL entry points.
DROP POLICY IF EXISTS refunds_staff_insert ON public.refunds;
CREATE POLICY refunds_staff_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_refunds(auth.uid(), tenant_id, property_id)
    AND initiated_by = auth.uid()
    AND status = ANY (ARRAY['DRAFT','PENDING_APPROVAL','PENDING_VERIFICATION'])
  );

-- ---------------------------------------------------------------------------
-- 2. Valid-amount enforcement at the DB level (defense in depth — the client
--    already checks a single refund against its payment; this additionally
--    blocks two non-terminal refunds against the same payment from together
--    exceeding it, including under concurrent inserts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refunds_guard_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_amount bigint;
  v_already_requested bigint;
BEGIN
  -- Serialises concurrent refund inserts against the same payment so the
  -- sum-check below can't race.
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-amount:' || NEW.payment_id::text, 0));

  SELECT amount_paise INTO v_payment_amount FROM public.payments WHERE id = NEW.payment_id;
  IF v_payment_amount IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT COALESCE(SUM(amount_paise), 0) INTO v_already_requested
  FROM public.refunds
  WHERE payment_id = NEW.payment_id
    AND id <> NEW.id
    AND status NOT IN ('REJECTED', 'CANCELLED', 'FAILED');

  IF v_already_requested + NEW.amount_paise > v_payment_amount THEN
    RAISE EXCEPTION 'Refund amount exceeds the payment balance (already requested/approved: %, payment: %)',
      v_already_requested, v_payment_amount;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_refunds_guard_amount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refunds_guard_amount ON public.refunds;
CREATE TRIGGER trg_refunds_guard_amount
  BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refunds_guard_amount();

-- ---------------------------------------------------------------------------
-- 3. Warden "verify deposit/move-out clearance" permission — same shape as
--    every other operational key in has_operational_permission_property()
--    (20260814090000): WARDEN has it by default, ACCOUNTANT can be granted
--    it, HOSTEL_ADMIN is unconditional. Not "approval" — fn_verify_refund_
--    clearance below can never move a refund to APPROVED/COMPLETED, only to
--    PENDING_APPROVAL (continue) or REJECTED (block the clearance).
-- ---------------------------------------------------------------------------
-- The live constraint (as of this migration) carries far more keys than the
-- 20260814090000 migration text alone suggests — later migrations (granular
-- CRUD pilot, student module permissions, ...) widened it further. Rebuilt
-- here from the actual live definition (read via pg_get_constraintdef right
-- before writing this) plus the one new key, not from any single prior
-- migration file, to avoid silently narrowing it back down.
ALTER TABLE public.role_assignments
  DROP CONSTRAINT role_assignments_permissions_shape;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (
      permissions
      - 'refunds' - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
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
      - 'student_profile_view' - 'student_profile_edit' - 'student_attendance_view'
      - 'student_complaints_view' - 'student_complaints_edit' - 'student_notices_view'
      - 'student_finance_view' - 'student_finance_edit'
      - 'student_gate_passes_view' - 'student_gate_passes_edit'
      - 'student_mess_view' - 'student_mess_edit'
      - 'refund_verification'
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
    AND (NOT (permissions ? 'student_profile_view') OR jsonb_typeof(permissions -> 'student_profile_view') = 'boolean')
    AND (NOT (permissions ? 'student_profile_edit') OR jsonb_typeof(permissions -> 'student_profile_edit') = 'boolean')
    AND (NOT (permissions ? 'student_attendance_view') OR jsonb_typeof(permissions -> 'student_attendance_view') = 'boolean')
    AND (NOT (permissions ? 'student_complaints_view') OR jsonb_typeof(permissions -> 'student_complaints_view') = 'boolean')
    AND (NOT (permissions ? 'student_complaints_edit') OR jsonb_typeof(permissions -> 'student_complaints_edit') = 'boolean')
    AND (NOT (permissions ? 'student_notices_view') OR jsonb_typeof(permissions -> 'student_notices_view') = 'boolean')
    AND (NOT (permissions ? 'student_finance_view') OR jsonb_typeof(permissions -> 'student_finance_view') = 'boolean')
    AND (NOT (permissions ? 'student_finance_edit') OR jsonb_typeof(permissions -> 'student_finance_edit') = 'boolean')
    AND (NOT (permissions ? 'student_gate_passes_view') OR jsonb_typeof(permissions -> 'student_gate_passes_view') = 'boolean')
    AND (NOT (permissions ? 'student_gate_passes_edit') OR jsonb_typeof(permissions -> 'student_gate_passes_edit') = 'boolean')
    AND (NOT (permissions ? 'student_mess_view') OR jsonb_typeof(permissions -> 'student_mess_view') = 'boolean')
    AND (NOT (permissions ? 'student_mess_edit') OR jsonb_typeof(permissions -> 'student_mess_edit') = 'boolean')
    AND (NOT (permissions ? 'refund_verification') OR jsonb_typeof(permissions -> 'refund_verification') = 'boolean')
  );

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member overrides. Finance keys (fee_plans, invoices, payments, refunds) default true for ACCOUNTANT, false for WARDEN — see can_manage_fee_plans() etc. Operational keys (attendance, complaints, gate_passes, gate_events, visitors, notices, mess_menus, feedback, refund_verification) default true for WARDEN, false for ACCOUNTANT — see can_manage_attendance()/can_verify_refunds() etc. Absent key = role default; HOSTEL_ADMIN is always unconditional.';

CREATE OR REPLACE FUNCTION public.can_verify_refunds(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'refund_verification');
$$;
REVOKE ALL ON FUNCTION public.can_verify_refunds(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_verify_refunds(uuid, uuid, uuid) TO authenticated;

-- Lets a Warden (or anyone with refund_verification) read refunds pending
-- their verification and whatever they've already acted on for their
-- property — refunds_staff_read (can_manage_refunds) does not cover Warden
-- by default, so without this a Warden has no visibility into this table
-- even for the one narrow action they're meant to take.
CREATE POLICY refunds_verifier_read ON public.refunds FOR SELECT TO authenticated
  USING (public.can_verify_refunds(auth.uid(), tenant_id, property_id));

-- ---------------------------------------------------------------------------
-- 4. Status-transition RPCs — same SECURITY DEFINER + FOR UPDATE row-lock +
--    strict-precondition-status shape as the existing fn_approve_refund, so
--    a concurrent second call always finds the row already moved past the
--    status it required and raises (duplicate-processing prevention).
-- ---------------------------------------------------------------------------

-- Warden-side clearance check. VERIFIED continues the existing approval
-- chain (-> PENDING_APPROVAL, still requiring a HOSTEL_ADMIN's financial
-- approval); REJECTED stops the refund here — a failed clearance, not a
-- financial decision, so approved_by/approved_at are left null and only the
-- verifier's own columns are set.
CREATE OR REPLACE FUNCTION public.fn_verify_refund_clearance(
  p_refund_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r public.refunds; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_decision NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'p_decision must be VERIFIED or REJECTED';
  END IF;

  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.can_verify_refunds(v_uid, v_r.tenant_id, v_r.property_id) THEN
    RAISE EXCEPTION 'Not authorized to verify refund clearance';
  END IF;
  IF v_r.status <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'Refund is not pending verification (status=%)', v_r.status;
  END IF;
  IF p_decision = 'REJECTED' AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'A reason is required to reject clearance';
  END IF;

  UPDATE public.refunds SET
    status = CASE WHEN p_decision = 'VERIFIED' THEN 'PENDING_APPROVAL' ELSE 'REJECTED' END,
    verified_by = v_uid, verified_at = now(), verification_notes = p_notes,
    decision_reason = CASE WHEN p_decision = 'REJECTED' THEN p_notes ELSE v_r.decision_reason END
  WHERE id = p_refund_id
  RETURNING * INTO v_r;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_verify_refund_clearance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_verify_refund_clearance(uuid, text, text) TO authenticated;

-- Accountant starts executing an APPROVED refund (e.g. initiates the actual
-- bank transfer) — a distinct step from completion so "processing" is
-- visible to everyone else while the transfer is in flight.
CREATE OR REPLACE FUNCTION public.fn_start_refund_processing(p_refund_id uuid)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r public.refunds; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.can_manage_refunds(v_uid, v_r.tenant_id, v_r.property_id) THEN
    RAISE EXCEPTION 'Not authorized to process refunds';
  END IF;
  IF v_r.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Refund is not approved (status=%)', v_r.status;
  END IF;

  UPDATE public.refunds SET
    status = 'PROCESSING', processing_started_by = v_uid, processing_started_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_r;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_start_refund_processing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_refund_processing(uuid) TO authenticated;

-- Accountant records the outcome + transaction reference. COMPLETED requires
-- a non-empty provider_refund_ref (the whole point of this step); FAILED
-- requires a reason and leaves the refund re-processable (back to PROCESSING
-- via another fn_start_refund_processing-style retry is intentionally not
-- offered here — a FAILED refund needs a human to re-approve the retry, so
-- it is left terminal; an Admin/Accountant can initiate a fresh refund
-- request instead, same as any other failed payment flow in this app).
-- On COMPLETED for a deposit/move-out-linked refund, also posts the matching
-- deposit_ledger_entries row the Deposit Ledger page already knows how to
-- read (REFUND_COMPLETED/DEBIT) — best-effort: if no allocation could be
-- resolved at submission time, the refund still completes, just without a
-- ledger entry (nothing to post against).
CREATE OR REPLACE FUNCTION public.fn_complete_refund(
  p_refund_id uuid,
  p_decision text,
  p_provider_refund_ref text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r public.refunds; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_decision NOT IN ('COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'p_decision must be COMPLETED or FAILED';
  END IF;

  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.can_manage_refunds(v_uid, v_r.tenant_id, v_r.property_id) THEN
    RAISE EXCEPTION 'Not authorized to process refunds';
  END IF;
  IF v_r.status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'Refund is not being processed (status=%)', v_r.status;
  END IF;
  IF p_decision = 'COMPLETED' AND (p_provider_refund_ref IS NULL OR btrim(p_provider_refund_ref) = '') THEN
    RAISE EXCEPTION 'A transaction reference is required to mark a refund completed';
  END IF;
  IF p_decision = 'FAILED' AND (p_failure_reason IS NULL OR btrim(p_failure_reason) = '') THEN
    RAISE EXCEPTION 'A failure reason is required';
  END IF;

  UPDATE public.refunds SET
    status = p_decision,
    processed_by = v_uid,
    provider_refund_ref = COALESCE(p_provider_refund_ref, v_r.provider_refund_ref),
    completed_at = CASE WHEN p_decision = 'COMPLETED' THEN now() ELSE v_r.completed_at END,
    failure_reason = CASE WHEN p_decision = 'FAILED' THEN p_failure_reason ELSE v_r.failure_reason END
  WHERE id = p_refund_id
  RETURNING * INTO v_r;

  IF p_decision = 'COMPLETED' AND v_r.requires_deposit_clearance AND v_r.allocation_id IS NOT NULL THEN
    INSERT INTO public.deposit_ledger_entries (
      tenant_id, property_id, student_id, allocation_id,
      entry_type, amount_paise, direction, reference_type, reference_id, description, created_by
    ) VALUES (
      v_r.tenant_id, v_r.property_id, v_r.student_id, v_r.allocation_id,
      'REFUND_COMPLETED', v_r.amount_paise, 'DEBIT', 'REFUND', v_r.id,
      'Refund ' || v_r.refund_number || ' completed (' || COALESCE(v_r.provider_refund_ref, '') || ')',
      v_uid
    );
  END IF;

  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_complete_refund(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_refund(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit trail — generic audit_log_trigger() (already used on fee_plans)
--    gives every INSERT/UPDATE on refunds a before/after snapshot + real
--    actor (auth.uid() is the caller's own, even inside the SECURITY
--    DEFINER functions above — SECURITY DEFINER changes privilege, not
--    session identity). Covers initiation and every transition in this
--    migration without bespoke logging code in each function.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_refunds_audit ON public.refunds;
CREATE TRIGGER trg_refunds_audit
  AFTER INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ---------------------------------------------------------------------------
-- 6. Notifications — IN_APP, direct insert (same pattern as
--    fn_notify_admins_complaint_resolved, 20260730121453): refunds has no
--    client-writable INSERT policy on `notifications`, and this must fire
--    regardless of which UI/RPC moved the row. (Payload enriched further by
--    20261022110000 — kept minimal here to match what was actually applied
--    first; see that migration for the live PENDING_APPROVAL branch.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_refund_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_event text;
  v_title text;
  v_body text;
  v_template text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'PENDING_VERIFICATION' THEN
    FOR v_recipient IN
      SELECT DISTINCT user_id FROM public.role_assignments
      WHERE tenant_id = NEW.tenant_id AND role = 'WARDEN' AND is_active = true
        AND (property_id IS NULL OR property_id = NEW.property_id)
        AND public.can_verify_refunds(user_id, NEW.tenant_id, NEW.property_id)
    LOOP
      INSERT INTO public.notifications (
        tenant_id, property_id, recipient_user_id, event_type, channel,
        template_key, payload, status, sent_at, delivered_at, idempotency_key
      ) VALUES (
        NEW.tenant_id, NEW.property_id, v_recipient, 'REFUND_PENDING_VERIFICATION', 'IN_APP',
        'refund_pending_verification',
        jsonb_build_object('title', 'Refund needs deposit clearance', 'refund_number', NEW.refund_number),
        'DELIVERED', now(), now(),
        'refund_pending_verification:' || NEW.id || ':' || v_recipient
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.status = 'PENDING_APPROVAL' THEN
    FOR v_recipient IN
      SELECT DISTINCT user_id FROM public.role_assignments
      WHERE tenant_id = NEW.tenant_id AND role = 'HOSTEL_ADMIN' AND is_active = true
        AND (property_id IS NULL OR property_id = NEW.property_id)
    LOOP
      INSERT INTO public.notifications (
        tenant_id, property_id, recipient_user_id, event_type, channel,
        template_key, payload, status, sent_at, delivered_at, idempotency_key
      ) VALUES (
        NEW.tenant_id, NEW.property_id, v_recipient, 'REFUND_PENDING_APPROVAL', 'IN_APP',
        'refund_pending_approval',
        jsonb_build_object('title', 'Refund needs approval', 'refund_number', NEW.refund_number),
        'DELIVERED', now(), now(),
        'refund_pending_approval:' || NEW.id || ':' || v_recipient
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;

  v_recipient := NEW.initiated_by;
  v_event := CASE NEW.status
    WHEN 'REJECTED' THEN 'REFUND_REJECTED'
    WHEN 'APPROVED' THEN 'REFUND_APPROVED'
    WHEN 'COMPLETED' THEN 'REFUND_COMPLETED'
    WHEN 'FAILED' THEN 'REFUND_FAILED'
    ELSE NULL
  END;
  IF v_event IS NULL THEN RETURN NEW; END IF;

  v_title := CASE NEW.status
    WHEN 'REJECTED' THEN 'Refund rejected'
    WHEN 'APPROVED' THEN 'Refund approved'
    WHEN 'COMPLETED' THEN 'Refund completed'
    WHEN 'FAILED' THEN 'Refund failed'
  END;
  v_template := 'refund_' || lower(NEW.status);

  INSERT INTO public.notifications (
    tenant_id, property_id, recipient_user_id, event_type, channel,
    template_key, payload, status, sent_at, delivered_at, idempotency_key
  ) VALUES (
    NEW.tenant_id, NEW.property_id, v_recipient, v_event, 'IN_APP',
    v_template,
    jsonb_build_object(
      'title', v_title, 'refund_number', NEW.refund_number,
      'reason', COALESCE(NEW.decision_reason, NEW.failure_reason)
    ),
    'DELIVERED', now(), now(),
    'refund_status:' || NEW.id || ':' || NEW.status
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_notify_refund_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refunds_notify_status_change ON public.refunds;
CREATE TRIGGER trg_refunds_notify_status_change
  AFTER INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_refund_status_change();
