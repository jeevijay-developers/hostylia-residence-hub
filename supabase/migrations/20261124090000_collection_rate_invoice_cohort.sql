-- =============================================================================
-- Collection Rate: a strict INVOICE COHORT, computed from the payment and refund rows themselves.
--
-- Follow-up to 20261123090000 (left untouched: it may already be applied). Same function, same signature and
-- result columns; only how Billed / Received / Refunded are obtained changes. Read-only, SECURITY INVOKER.
--
-- COHORT   the invoices issued within [p_from, p_to] (invoices.issue_date, inclusive; NULL = unbounded), of the
--          property, not deleted, and not DRAFT / VOID / fully REFUNDED. A fully refunded invoice is recognised by
--          its status AND by its money (CAPTURED payments > 0 and COMPLETED refunds >= those payments), so a stale
--          status cannot let it slip in.
-- BILLED   sum(total_paise) of the cohort.
-- RECEIVED sum of payments.amount_paise with status CAPTURED whose invoice_id is a cohort invoice  (read from the
--          payments table, not from the invoice's cached paid_paise).
-- REFUNDED sum of refunds.amount_paise with status COMPLETED whose payment belongs to a cohort invoice (read from the
--          refunds table, not from the cached refunded_paise).
-- Payments and refunds are followed to the cohort invoices REGARDLESS OF WHEN THEY HAPPENED: a payment made in a
-- later month for an October invoice counts toward October's collection rate, and appears in no other period.
-- RATE     (Received - Refunded) / Billed * 100, rounded to 2 decimals; 0 when nothing is billed.
--
-- Unchanged on purpose: Pending / Due-unpaid / Overdue (balance_paise, status, property-local "today"), the aging
-- functions, and every table. Nothing is written.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_collection_report(
  p_property_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  as_of date,
  eligible_invoice_count bigint,
  billed_paise bigint,
  received_paise bigint,
  refunded_paise bigint,
  collected_paise bigint,
  collection_rate_pct numeric,
  pending_paise bigint,
  due_unpaid_count bigint,
  overdue_count bigint,
  overdue_balance_paise bigint,
  overdue_pct numeric
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_today date;
BEGIN
  SELECT (now() AT TIME ZONE coalesce(pr.timezone, 'Asia/Kolkata'))::date INTO v_today
    FROM public.properties pr WHERE pr.id = p_property_id;
  v_today := coalesce(v_today, (now() AT TIME ZONE 'Asia/Kolkata')::date);

  RETURN QUERY
  WITH cohort AS (
    SELECT i.id, i.total_paise, i.balance_paise, i.due_date, i.status
      FROM public.invoices i
     WHERE i.property_id = p_property_id
       AND i.deleted_at IS NULL
       AND i.status NOT IN ('DRAFT', 'VOID', 'REFUNDED')
       AND (p_from IS NULL OR i.issue_date >= p_from)
       AND (p_to IS NULL OR i.issue_date <= p_to)
  ),
  pay AS (
    SELECT p.invoice_id, sum(p.amount_paise) AS paid
      FROM public.payments p
     WHERE p.status = 'CAPTURED' AND p.invoice_id IN (SELECT c.id FROM cohort c)
     GROUP BY p.invoice_id
  ),
  ref AS (
    SELECT p.invoice_id, sum(r.amount_paise) AS refunded
      FROM public.refunds r
      JOIN public.payments p ON p.id = r.payment_id
     WHERE r.status = 'COMPLETED' AND p.invoice_id IN (SELECT c.id FROM cohort c)
     GROUP BY p.invoice_id
  ),
  inv AS (
    SELECT c.total_paise, c.balance_paise, c.due_date, c.status,
           coalesce(pay.paid, 0) AS paid, coalesce(ref.refunded, 0) AS refunded
      FROM cohort c
      LEFT JOIN pay ON pay.invoice_id = c.id
      LEFT JOIN ref ON ref.invoice_id = c.id
     WHERE NOT (coalesce(pay.paid, 0) > 0 AND coalesce(ref.refunded, 0) >= coalesce(pay.paid, 0))
  ),
  agg AS (
    SELECT
      count(*)                                                    AS n,
      coalesce(sum(total_paise), 0)                               AS billed,
      coalesce(sum(paid), 0)                                      AS received,
      coalesce(sum(refunded), 0)                                  AS refunded,
      coalesce(sum(balance_paise) FILTER (WHERE balance_paise > 0 AND status <> 'PAID'), 0) AS pending,
      count(*) FILTER (WHERE balance_paise > 0 AND status <> 'PAID')                        AS due_unpaid,
      count(*) FILTER (WHERE balance_paise > 0 AND status <> 'PAID' AND due_date < v_today) AS overdue,
      coalesce(sum(balance_paise) FILTER (WHERE balance_paise > 0 AND status <> 'PAID' AND due_date < v_today), 0) AS overdue_balance
    FROM inv
  )
  SELECT
    v_today,
    a.n,
    a.billed::bigint,
    a.received::bigint,
    a.refunded::bigint,
    (a.received - a.refunded)::bigint,
    CASE WHEN a.billed = 0 THEN 0::numeric ELSE round((a.received - a.refunded)::numeric * 100.0 / a.billed, 2) END,
    a.pending::bigint,
    a.due_unpaid,
    a.overdue,
    a.overdue_balance::bigint,
    CASE WHEN a.due_unpaid = 0 THEN 0::numeric ELSE round(a.overdue::numeric * 100.0 / a.due_unpaid, 2) END
  FROM agg a;
END $$;

REVOKE ALL ON FUNCTION public.fn_collection_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_collection_report(uuid, date, date) TO authenticated;
