-- Finance fixes: automatic OVERDUE, gateway-confirmed refunds, invoice refund accounting.
--
-- 1. OVERDUE: a daily job flips ISSUED / PARTIALLY_PAID invoices that still carry a
--    balance past their due date (property-local date) to OVERDUE. Nothing else
--    about the invoice or its payments is touched. fn_recalc_invoice_status (payment
--    trigger) now follows the same rule, so a later partial payment no longer flips
--    a past-due invoice back to PARTIALLY_PAID.
--
-- 2. Refunds are completed ONLY by confirmation:
--      APPROVED --fn_start_refund_processing--> PROCESSING --gateway confirms--> COMPLETED
--    * Razorpay-paid refunds: the razorpay-refund Edge Function creates the refund at the
--      gateway and reports the verdict through fn_record_refund_gateway_result (service
--      role only). 'processed' completes it; 'failed' fails it (retryable); anything
--      else, or an unknown outcome (timeout / 5xx), leaves it PROCESSING. Manual
--      completion (fn_complete_refund) is refused for gateway payments, so approval or
--      a human click can never mark a gateway refund paid.
--    * Offline payments (cash / cheque / bank transfer) have no gateway: the existing
--      Accountant-records-payout path (fn_complete_refund, reference required) is kept.
--    * Duplicate prevention: the status transition takes a row lock, a gateway attempt
--      can only be claimed once per window, the gateway refund id is unique, and the
--      Edge Function looks for an existing gateway refund (notes.refund_id) before
--      creating one.
--
-- 3. Invoice accounting: on a COMPLETED refund the invoice is recomputed:
--      refunded_paise = sum of COMPLETED refunds of the invoice's payments
--      status          = REFUNDED when refunded >= paid, PARTIALLY_REFUNDED when 0 < refunded < paid
--    paid_paise stays the gross captured amount and payment rows are never edited
--    (their status stays CAPTURED). A refund is a reversal, not a new debt, so it never
--    re-opens balance_paise.

-- ---------------------------------------------------------------------------
-- 0. Gateway bookkeeping on refunds
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- One gateway refund can belong to exactly one refund row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_refunds_provider_ref
  ON public.refunds (provider, provider_refund_ref)
  WHERE provider_refund_ref IS NOT NULL AND provider IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Invoice recompute (payments + completed refunds + overdue)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: from the payments trigger it runs with the payer's
-- rights exactly as before; from the SECURITY DEFINER refund functions it runs as
-- the owner.
CREATE OR REPLACE FUNCTION public.fn_recompute_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_inv public.invoices;
  v_paid bigint;
  v_refunded bigint;
  v_balance bigint;
  v_today date;
  v_status text;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status = 'VOID' THEN RETURN; END IF;

  SELECT (now() AT TIME ZONE coalesce(pr.timezone, 'Asia/Kolkata'))::date INTO v_today
    FROM public.properties pr WHERE pr.id = v_inv.property_id;
  v_today := coalesce(v_today, CURRENT_DATE);

  SELECT COALESCE(SUM(amount_paise), 0) INTO v_paid
    FROM public.payments WHERE invoice_id = p_invoice_id AND status = 'CAPTURED';
  SELECT COALESCE(SUM(r.amount_paise), 0) INTO v_refunded
    FROM public.refunds r JOIN public.payments p ON p.id = r.payment_id
   WHERE p.invoice_id = p_invoice_id AND r.status = 'COMPLETED';

  v_balance := GREATEST(v_inv.total_paise - v_paid - v_inv.deposit_adjusted_paise, 0);
  v_status := CASE
    WHEN v_paid > 0 AND v_refunded >= v_paid THEN 'REFUNDED'
    WHEN v_refunded > 0 THEN 'PARTIALLY_REFUNDED'
    WHEN v_paid + v_inv.deposit_adjusted_paise >= v_inv.total_paise THEN 'PAID'
    WHEN v_balance > 0 AND v_inv.status <> 'DRAFT' AND v_inv.due_date < v_today THEN 'OVERDUE'
    WHEN v_paid + v_inv.deposit_adjusted_paise > 0 THEN 'PARTIALLY_PAID'
    ELSE v_inv.status
  END;

  UPDATE public.invoices SET
    paid_paise = v_paid,
    refunded_paise = v_refunded,
    balance_paise = v_balance,
    status = v_status,
    updated_at = now()
  WHERE id = p_invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.fn_recompute_invoice(NEW.invoice_id);
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Daily OVERDUE job
-- ---------------------------------------------------------------------------
-- Idempotent: only rows that need the change are touched, so a re-run changes nothing.
-- Excluded: DRAFT, VOID, PAID, refunded, soft-deleted and zero-balance invoices.
CREATE OR REPLACE FUNCTION public.fn_mark_overdue_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.invoices i
     SET status = 'OVERDUE', updated_at = now()
    FROM public.properties pr
   WHERE pr.id = i.property_id
     AND i.deleted_at IS NULL
     AND i.status IN ('ISSUED', 'PARTIALLY_PAID')
     AND i.balance_paise > 0
     AND i.due_date < (now() AT TIME ZONE coalesce(pr.timezone, 'Asia/Kolkata'))::date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_mark_overdue_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_overdue_invoices() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoices-mark-overdue') THEN
    PERFORM cron.unschedule('invoices-mark-overdue');
  END IF;
  -- 18:45 UTC = 00:15 IST: just after the local date rolls over in India.
  PERFORM cron.schedule('invoices-mark-overdue', '45 18 * * *', $cmd$SELECT public.fn_mark_overdue_invoices();$cmd$);
END $$;

-- One-off catch-up: invoices that are already past due but were never flipped (the old
-- rule only ran on a payment event, so unpaid invoices stayed ISSUED forever).
SELECT public.fn_mark_overdue_invoices();

-- ---------------------------------------------------------------------------
-- 3. Refund amount guard: only a captured payment is refundable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refunds_guard_amount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_amount bigint;
  v_payment_status text;
  v_already_requested bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-amount:' || NEW.payment_id::text, 0));

  SELECT amount_paise, status INTO v_payment_amount, v_payment_status
    FROM public.payments WHERE id = NEW.payment_id;
  IF v_payment_amount IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  IF v_payment_status NOT IN ('CAPTURED', 'PARTIALLY_REFUNDED') THEN
    RAISE EXCEPTION 'Only a captured payment can be refunded (payment status: %)', v_payment_status;
  END IF;

  SELECT COALESCE(SUM(amount_paise), 0) INTO v_already_requested
  FROM public.refunds
  WHERE payment_id = NEW.payment_id
    AND id <> NEW.id
    AND status NOT IN ('REJECTED', 'CANCELLED', 'FAILED');

  IF v_already_requested + NEW.amount_paise > v_payment_amount THEN
    RAISE EXCEPTION 'Refund amount exceeds the refundable payment balance (already requested/approved/refunded: %, payment: %)',
      v_already_requested, v_payment_amount;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_refunds_guard_amount() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Completing a refund: shared finalisation (deposit ledger + invoice accounting)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finalize_completed_refund(p_refund_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_r public.refunds;
  v_invoice uuid;
BEGIN
  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id;
  IF NOT FOUND OR v_r.status <> 'COMPLETED' THEN RETURN; END IF;

  IF v_r.requires_deposit_clearance AND v_r.allocation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.deposit_ledger_entries d
        WHERE d.reference_type = 'REFUND' AND d.reference_id = v_r.id AND d.entry_type = 'REFUND_COMPLETED') THEN
    INSERT INTO public.deposit_ledger_entries (
      tenant_id, property_id, student_id, allocation_id,
      entry_type, amount_paise, direction, reference_type, reference_id, description, created_by
    ) VALUES (
      v_r.tenant_id, v_r.property_id, v_r.student_id, v_r.allocation_id,
      'REFUND_COMPLETED', v_r.amount_paise, 'DEBIT', 'REFUND', v_r.id,
      'Refund ' || v_r.refund_number || ' completed (' || COALESCE(v_r.provider_refund_ref, '') || ')',
      COALESCE(auth.uid(), v_r.processed_by, v_r.processing_started_by, v_r.approved_by, v_r.initiated_by)
    );
  END IF;

  SELECT invoice_id INTO v_invoice FROM public.payments WHERE id = v_r.payment_id;
  IF v_invoice IS NOT NULL THEN
    PERFORM public.fn_recompute_invoice(v_invoice);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_finalize_completed_refund(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Start / retry processing
-- ---------------------------------------------------------------------------
-- APPROVED -> PROCESSING. A refund that FAILED at the gateway may be retried (bounded).
-- The row lock makes a concurrent second call see PROCESSING and raise.
CREATE OR REPLACE FUNCTION public.fn_start_refund_processing(p_refund_id uuid)
RETURNS public.refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_r public.refunds; v_uid uuid := auth.uid();
  v_pay_amount bigint; v_pay_provider text; v_others bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.can_manage_refunds(v_uid, v_r.tenant_id, v_r.property_id) THEN
    RAISE EXCEPTION 'Not authorized to process refunds';
  END IF;

  SELECT amount_paise, provider INTO v_pay_amount, v_pay_provider FROM public.payments WHERE id = v_r.payment_id;

  IF v_r.status = 'APPROVED' THEN
    NULL;
  ELSIF v_r.status = 'FAILED' AND v_r.provider IS NOT NULL AND v_r.attempt_count < 5 THEN
    -- A FAILED refund is excluded from the in-flight sum, so make sure the amount
    -- is still refundable before trying again.
    PERFORM pg_advisory_xact_lock(hashtextextended('refund-amount:' || v_r.payment_id::text, 0));
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_others FROM public.refunds
     WHERE payment_id = v_r.payment_id AND id <> v_r.id AND status NOT IN ('REJECTED', 'CANCELLED', 'FAILED');
    IF v_others + v_r.amount_paise > v_pay_amount THEN
      RAISE EXCEPTION 'Cannot retry: the refundable balance of the payment is no longer enough';
    END IF;
  ELSE
    RAISE EXCEPTION 'Refund is not approved (status=%)', v_r.status;
  END IF;

  UPDATE public.refunds SET
    status = 'PROCESSING',
    provider = CASE WHEN v_pay_provider = 'razorpay' THEN 'razorpay' ELSE provider END,
    processing_started_by = v_uid, processing_started_at = now(),
    attempt_count = attempt_count + 1, last_attempt_at = now(),
    failure_reason = NULL, last_error = NULL
  WHERE id = p_refund_id
  RETURNING * INTO v_r;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_start_refund_processing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_refund_processing(uuid) TO authenticated;

-- One in-flight gateway attempt per window: the first caller wins, others get false.
-- Used by the Edge Function when a refund is already PROCESSING without a gateway id
-- (an earlier call timed out), so two requests can never both create a gateway refund.
CREATE OR REPLACE FUNCTION public.fn_claim_refund_gateway_attempt(p_refund_id uuid, p_window_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.refunds
     SET last_attempt_at = now(), attempt_count = attempt_count + 1
   WHERE id = p_refund_id AND status = 'PROCESSING' AND provider_refund_ref IS NULL
     AND (last_attempt_at IS NULL OR last_attempt_at < now() - make_interval(secs => p_window_seconds));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.fn_claim_refund_gateway_attempt(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_refund_gateway_attempt(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The ONLY way a gateway refund becomes COMPLETED / FAILED: a gateway verdict
-- ---------------------------------------------------------------------------
-- p_gateway_status: 'processed' (money returned), 'failed', or 'pending'
-- (initiated / unknown — also used to record a transient error and stay PROCESSING).
-- Idempotent: replaying the same verdict (webhook retries, double polling) is a no-op.
CREATE OR REPLACE FUNCTION public.fn_record_refund_gateway_result(
  p_refund_id uuid,
  p_gateway_refund_id text,
  p_gateway_status text,
  p_amount_paise bigint DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS public.refunds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.refunds;
BEGIN
  IF p_gateway_status NOT IN ('pending', 'processed', 'failed') THEN
    RAISE EXCEPTION 'Unknown gateway refund status %', p_gateway_status;
  END IF;

  SELECT * INTO v_r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;

  -- Already completed: success is final; anything else is ignored (never un-complete).
  IF v_r.status = 'COMPLETED' THEN
    IF p_gateway_refund_id IS NOT NULL AND v_r.provider_refund_ref IS DISTINCT FROM p_gateway_refund_id THEN
      RAISE EXCEPTION 'Refund % is already completed under a different gateway refund', v_r.refund_number;
    END IF;
    RETURN v_r;
  END IF;
  IF v_r.status NOT IN ('PROCESSING', 'FAILED') THEN
    RAISE EXCEPTION 'Refund is not being processed (status=%)', v_r.status;
  END IF;
  IF p_gateway_refund_id IS NOT NULL AND v_r.provider_refund_ref IS NOT NULL
     AND v_r.provider_refund_ref <> p_gateway_refund_id THEN
    RAISE EXCEPTION 'Refund is already bound to a different gateway refund';
  END IF;

  IF p_gateway_status = 'processed' THEN
    IF p_gateway_refund_id IS NULL THEN
      RAISE EXCEPTION 'A gateway refund id is required to complete a refund';
    END IF;
    IF p_amount_paise IS DISTINCT FROM v_r.amount_paise THEN
      RAISE EXCEPTION 'Gateway refund amount (%) does not match the approved amount (%)', p_amount_paise, v_r.amount_paise;
    END IF;
    UPDATE public.refunds SET
      status = 'COMPLETED', provider = 'razorpay', provider_refund_ref = p_gateway_refund_id,
      provider_status = 'processed', completed_at = now(), failure_reason = NULL, last_error = NULL
    WHERE id = p_refund_id RETURNING * INTO v_r;
    PERFORM public.fn_finalize_completed_refund(v_r.id);
    RETURN v_r;
  END IF;

  IF p_gateway_status = 'failed' THEN
    IF v_r.status = 'FAILED' THEN RETURN v_r; END IF;
    UPDATE public.refunds SET
      status = 'FAILED', provider = COALESCE(provider, 'razorpay'),
      provider_refund_ref = COALESCE(p_gateway_refund_id, provider_refund_ref),
      provider_status = 'failed',
      failure_reason = COALESCE(NULLIF(btrim(p_error), ''), 'The gateway reported the refund as failed'),
      last_error = p_error
    WHERE id = p_refund_id RETURNING * INTO v_r;
    RETURN v_r;
  END IF;

  -- pending / unknown outcome: stay PROCESSING, remember what we know.
  IF v_r.status = 'PROCESSING' THEN
    UPDATE public.refunds SET
      provider = COALESCE(provider, 'razorpay'),
      provider_refund_ref = COALESCE(p_gateway_refund_id, provider_refund_ref),
      provider_status = CASE WHEN p_gateway_refund_id IS NOT NULL THEN 'pending' ELSE provider_status END,
      last_error = p_error
    WHERE id = p_refund_id RETURNING * INTO v_r;
  END IF;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_record_refund_gateway_result(uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_refund_gateway_result(uuid, text, text, bigint, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Manual completion: offline payments only, and now updates the invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_complete_refund(
  p_refund_id uuid, p_decision text, p_provider_refund_ref text DEFAULT NULL, p_failure_reason text DEFAULT NULL
) RETURNS public.refunds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.refunds; v_uid uuid := auth.uid(); v_provider text;
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

  SELECT provider INTO v_provider FROM public.payments WHERE id = v_r.payment_id;
  IF v_provider = 'razorpay' OR v_r.provider IS NOT NULL THEN
    RAISE EXCEPTION 'This refund goes through the payment gateway: it is completed or failed only by the gateway''s confirmation (use "Check status" or "Retry")';
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

  IF p_decision = 'COMPLETED' THEN
    PERFORM public.fn_finalize_completed_refund(v_r.id);
  END IF;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.fn_complete_refund(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_refund(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Backfill refunded_paise for refunds that were already COMPLETED before this
--    migration (the column was never maintained). Recomputes only invoices that have one.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.invoice_id
      FROM public.refunds rf JOIN public.payments p ON p.id = rf.payment_id
     WHERE rf.status = 'COMPLETED' AND p.invoice_id IS NOT NULL
  LOOP
    PERFORM public.fn_recompute_invoice(r.invoice_id);
  END LOOP;
END $$;
