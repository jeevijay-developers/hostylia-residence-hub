-- PRD post-payment activation flow (Allocation -> ACTIVE, Student -> ACTIVE,
-- Bed -> OCCUPIED) was wired as a *separate* client round-trip after
-- record_manual_payment(): the TS handler read `pay.student_id` off the
-- RPC's response, queried for a PENDING_PAYMENT allocation, then called
-- activate_allocation() in a second request. This is not atomic with the
-- payment, and depends on correctly round-tripping a non-SETOF RPC response
-- through PostgREST/supabase-js — three payments recorded through this path
-- (INV-2608-00001/2/3) all landed with the invoice correctly PAID but the
-- allocation still stuck at PENDING_PAYMENT and the student still APPLICANT,
-- confirming the activation step was silently not taking effect.
--
-- Fix: fold the activation into record_manual_payment() itself, in the same
-- transaction as the payment insert — the exact PRD-required flow now can't
-- be separated from the payment that triggers it. No business rule changes:
-- activate_allocation() itself (the atomic Allocation/Student/Bed update) is
-- untouched, and its own PENDING_PAYMENT guard still makes later rent
-- payments on an already-ACTIVE allocation a no-op, same as before.

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
  IF NOT public.is_finance_staff(v_uid, v_inv.tenant_id, v_inv.property_id) THEN
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

  -- First payment on a fresh allocation: activate it (and the student, and
  -- the bed) atomically in this same transaction — RULES.md 19.3/19.5.
  -- No-ops via activate_allocation()'s own guard if nothing is sitting in
  -- PENDING_PAYMENT for this student (e.g. a later recurring rent payment).
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
