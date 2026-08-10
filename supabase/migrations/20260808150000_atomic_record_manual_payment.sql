-- recordManualPayment (src/lib/finance.functions.ts) checked the invoice's
-- status/balance with a plain SELECT, then inserted the payment as a
-- separate step — a classic TOCTOU race. Two concurrent payment submissions
-- against the same invoice (double-click, two staff, retried request) could
-- both read the same balance, both pass the "amount <= balance" check, and
-- both insert — overpaying/duplicating a payment the checks were meant to
-- block. fn_recalc_invoice_status only recomputes the derived total after
-- the fact; it doesn't reject the second insert.
--
-- Fix: do the status/balance check and the insert inside one SECURITY
-- DEFINER function with `SELECT ... FOR UPDATE` on the invoice row, so a
-- second concurrent call blocks until the first commits and then re-reads
-- the now-updated balance — matching the existing atomic-operation pattern
-- (activate_allocation, complete_move_out). No business rule changes: same
-- checks (payable status, amount <= balance), just made atomic.

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

  RETURN v_pay;
END $$;

REVOKE ALL ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) TO authenticated;
-- Supabase grants EXECUTE on new functions directly to `anon` by default
-- (not via PUBLIC, so REVOKE ... FROM PUBLIC above doesn't touch it) —
-- revoke explicitly. The function's own `auth.uid() IS NULL` check would
-- still reject a truly anonymous caller, but the grant itself shouldn't
-- exist for a money-moving function.
REVOKE EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, bigint, text, date, text) FROM anon;
