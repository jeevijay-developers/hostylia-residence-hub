-- Temporary Payment Simulation Mode — block refunds against simulated
-- payments at the database level (not only in the UI), per explicit
-- decision: defense in depth.
--
-- fn_refunds_guard_amount() already runs as a BEFORE INSERT trigger on
-- `refunds` for every refund-creation path in the system (staff-initiated,
-- student-initiated, and move-out/deposit-linked — they all insert into the
-- same `refunds` table, so this one trigger covers all of them). It already
-- fetches the referenced payment's amount/status; this migration only adds
-- one more column to that existing SELECT and one more guard clause.
--
-- BEFORE INSERT only (unchanged) — this never re-evaluates existing refund
-- rows, so no historical refund is affected by this migration.

CREATE OR REPLACE FUNCTION public.fn_refunds_guard_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_amount bigint;
  v_payment_status text;
  v_payment_provider text;
  v_already_requested bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-amount:' || NEW.payment_id::text, 0));

  SELECT amount_paise, status, provider INTO v_payment_amount, v_payment_status, v_payment_provider
    FROM public.payments WHERE id = NEW.payment_id;
  IF v_payment_amount IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  IF v_payment_provider = 'simulated' THEN
    RAISE EXCEPTION 'A simulated payment cannot be refunded';
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
END
$function$;
