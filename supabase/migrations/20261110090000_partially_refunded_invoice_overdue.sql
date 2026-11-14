-- =============================================================================
-- Partially refunded invoices become eligible for OVERDUE detection
-- (follow-up to 20261109090000, which is already on the shared branch and is left untouched)
--
-- Rules after this migration (everything else in fn_recompute_invoice is unchanged):
--   * fully refunded (paid > 0 and refunded >= paid)            -> REFUNDED, balance 0
--   * refunded > 0, balance > 0, due date passed (property tz)   -> OVERDUE
--   * refunded > 0 otherwise                                     -> PARTIALLY_REFUNDED
-- Refund history is not lost: refunds rows, refunded_paise and paid_paise are untouched by the status
-- change, and balance_paise = total - (paid - refunded) - deposit_adjusted as before.
-- =============================================================================

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

  -- Net received = CAPTURED payments - COMPLETED refunds; a partial refund re-opens the balance,
  -- a full refund closes the invoice (REFUNDED, balance 0). Deposit adjustment counted once.
  v_balance := CASE
    WHEN v_paid > 0 AND v_refunded >= v_paid THEN 0
    ELSE GREATEST(v_inv.total_paise - (v_paid - v_refunded) - v_inv.deposit_adjusted_paise, 0)
  END;
  v_status := CASE
    WHEN v_paid > 0 AND v_refunded >= v_paid THEN 'REFUNDED'
    WHEN v_refunded > 0 AND v_balance > 0 AND v_inv.status <> 'DRAFT' AND v_inv.due_date < v_today THEN 'OVERDUE'
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

-- Daily job: PARTIALLY_REFUNDED with an outstanding balance past its due date now qualifies.
-- Only status/updated_at change; REFUNDED (balance 0), PAID, VOID, DRAFT, soft-deleted stay excluded.
CREATE OR REPLACE FUNCTION public.fn_mark_overdue_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.invoices i
     SET status = 'OVERDUE', updated_at = now()
    FROM public.properties pr
   WHERE pr.id = i.property_id
     AND i.deleted_at IS NULL
     AND i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED')
     AND i.balance_paise > 0
     AND i.due_date < (now() AT TIME ZONE coalesce(pr.timezone, 'Asia/Kolkata'))::date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_mark_overdue_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_overdue_invoices() TO service_role;

-- Re-run the accounting once for invoices that already have COMPLETED refunds: 20261109090000 backfilled
-- them under the earlier rule (refund never re-opened the balance), so their balance_paise is stale.
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

-- One-off catch-up for invoices that are already partially refunded and past due.
SELECT public.fn_mark_overdue_invoices();
