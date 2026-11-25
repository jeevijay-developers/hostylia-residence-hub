-- Temporary Payment Simulation Mode — exclude simulated payments from real
-- collection/revenue reporting.
--
-- fn_collection_report and fn_collection_series both aggregate captured
-- payments with no filter on provider. A simulated payment (provider =
-- 'simulated', status = 'CAPTURED') would otherwise inflate the "Collected"
-- / "Collection Rate" KPIs these functions back on the Admin Finance
-- Overview. fn_recompute_invoice is deliberately NOT touched by this
-- migration — an invoice must still show as paid when settled by a
-- simulated payment (that's the whole point of the feature); only
-- tenant/property-wide revenue reporting excludes it.
--
-- Both functions are re-created with their `pay` CTE's WHERE clause
-- extended by one condition; everything else (cohort selection, refund
-- reconciliation, date bucketing) is byte-for-byte identical to the live
-- versions this migration was built against.

CREATE OR REPLACE FUNCTION public.fn_collection_report(p_property_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
RETURNS TABLE(as_of date, eligible_invoice_count bigint, billed_paise bigint, received_paise bigint, refunded_paise bigint, collected_paise bigint, collection_rate_pct numeric, pending_paise bigint, due_unpaid_count bigint, overdue_count bigint, overdue_balance_paise bigint, overdue_pct numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
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
     WHERE p.status = 'CAPTURED'
       AND p.provider IS DISTINCT FROM 'simulated'
       AND p.invoice_id IN (SELECT c.id FROM cohort c)
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
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_collection_series(p_property_id uuid, p_from date, p_to date, p_granularity text DEFAULT 'day'::text)
RETURNS TABLE(period date, received_paise bigint, refunded_paise bigint, collected_paise bigint)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_step interval;
  v_lo date;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'A valid p_from/p_to range is required';
  END IF;
  IF p_granularity NOT IN ('day', 'month') THEN
    RAISE EXCEPTION 'p_granularity must be ''day'' or ''month''';
  END IF;
  IF p_granularity = 'day' AND (p_to - p_from) > 366 THEN
    RAISE EXCEPTION 'Date range too large for daily grouping (max 366 days)';
  END IF;

  v_step := CASE WHEN p_granularity = 'day' THEN interval '1 day' ELSE interval '1 month' END;
  v_lo := CASE WHEN p_granularity = 'day' THEN p_from
               ELSE date_trunc('month', p_from::timestamp)::date END;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(v_lo, p_to, v_step)::date AS period
  ),
  cohort AS (
    SELECT i.id,
           CASE WHEN p_granularity = 'day' THEN i.issue_date
                ELSE date_trunc('month', i.issue_date::timestamp)::date END AS period
      FROM public.invoices i
     WHERE i.property_id = p_property_id
       AND i.deleted_at IS NULL
       AND i.status NOT IN ('DRAFT', 'VOID', 'REFUNDED')
       AND i.issue_date BETWEEN p_from AND p_to
  ),
  pay AS (
    SELECT p.invoice_id, sum(p.amount_paise) AS paid
      FROM public.payments p
     WHERE p.status = 'CAPTURED'
       AND p.provider IS DISTINCT FROM 'simulated'
       AND p.invoice_id IN (SELECT c.id FROM cohort c)
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
    SELECT c.period, coalesce(pay.paid, 0) AS paid, coalesce(ref.refunded, 0) AS refunded
      FROM cohort c
      LEFT JOIN pay ON pay.invoice_id = c.id
      LEFT JOIN ref ON ref.invoice_id = c.id
     WHERE NOT (coalesce(pay.paid, 0) > 0 AND coalesce(ref.refunded, 0) >= coalesce(pay.paid, 0))
  ),
  agg AS (
    SELECT inv.period, coalesce(sum(inv.paid), 0) AS received, coalesce(sum(inv.refunded), 0) AS refunded
      FROM inv GROUP BY inv.period
  )
  SELECT b.period,
         coalesce(a.received, 0)::bigint,
         coalesce(a.refunded, 0)::bigint,
         (coalesce(a.received, 0) - coalesce(a.refunded, 0))::bigint
    FROM buckets b
    LEFT JOIN agg a ON a.period = b.period
   ORDER BY b.period;
END
$function$;
