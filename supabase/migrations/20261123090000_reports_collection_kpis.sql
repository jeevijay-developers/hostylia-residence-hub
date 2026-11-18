-- =============================================================================
-- Admin Reports > DSO & Aging: Collection Rate + Overdue Invoices, aggregated in the database.
--
-- The report used to fetch at most 500 rows of v_invoice_aging and add them up in JavaScript (truncated
-- for any property with more invoices, no date range, DRAFT invoices counted as unpaid). These read-only
-- functions replace that with exact database-side aggregation / pagination. No table, column, status,
-- payment or refund is changed; nothing is written.
--
-- SECURITY INVOKER (the default): they run with the caller's rights, so the existing RLS on invoices /
-- payments / students decides what is visible, exactly as for the old queries. A caller who cannot see a
-- property's invoices gets zeros / no rows.
--
-- ACCOUNTING RULES (same source of truth as fn_recompute_invoice: invoices.paid_paise = CAPTURED payments,
-- invoices.refunded_paise = COMPLETED refunds, invoices.balance_paise = what is still owed):
--   Period      invoices whose issue_date is within [p_from, p_to] (inclusive; NULL = unbounded). Payments and
--               refunds are those of the invoices in the period, so every figure describes the same invoices.
--   Eligible    not deleted, status NOT IN (DRAFT, VOID, REFUNDED): drafts are not billed yet, void invoices
--               are cancelled and fully refunded invoices net to nothing. PARTIALLY_REFUNDED stays eligible.
--   Billed      sum(total_paise) of eligible invoices
--   Received    sum(paid_paise)     successful (CAPTURED) payments on them, gross
--   Refunded    sum(refunded_paise) COMPLETED refunds on them
--   Collection rate = (Received - Refunded) / Billed * 100   (0 when nothing is billed)
--   Pending     sum(balance_paise) of eligible invoices with balance_paise > 0 and status <> PAID
--   Due unpaid  count of those invoices (partially paid ones included, not-yet-due ones included)
--   Overdue     due unpaid AND due_date < today, where today is the property's own local date
--               (properties.timezone, default Asia/Kolkata), the same clock the daily OVERDUE job uses
--   Overdue %   overdue / due unpaid * 100   (0 when there are none)
-- Deposit adjustments are not payments, so they are not part of "Received".
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
  WITH inv AS (
    SELECT i.total_paise, i.paid_paise, i.refunded_paise AS refunded, i.balance_paise, i.due_date, i.status
      FROM public.invoices i
     WHERE i.property_id = p_property_id
       AND i.deleted_at IS NULL
       AND i.status NOT IN ('DRAFT', 'VOID', 'REFUNDED')
       AND (p_from IS NULL OR i.issue_date >= p_from)
       AND (p_to IS NULL OR i.issue_date <= p_to)
  ),
  agg AS (
    SELECT
      count(*)                                                    AS n,
      coalesce(sum(total_paise), 0)                               AS billed,
      coalesce(sum(paid_paise), 0)                                AS received,
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

-- Aging buckets: the SAME view and bucket rules the report always used (v_invoice_aging), summed in the
-- database instead of over a 500-row sample. Unchanged semantics: all-time snapshot, 'paid' bucket excluded.
CREATE OR REPLACE FUNCTION public.fn_aging_buckets(p_property_id uuid)
RETURNS TABLE (aging_bucket text, invoice_count bigint, balance_paise bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT v.aging_bucket, count(*), coalesce(sum(v.balance_paise), 0)::bigint
    FROM public.v_invoice_aging v
   WHERE v.property_id = p_property_id AND v.aging_bucket <> 'paid'
   GROUP BY v.aging_bucket;
$$;

-- The aging detail list, server-side paginated, with the exact total on every row (no 500 cap).
-- Same rows and order as before: unpaid invoices, most days overdue first (id as a stable tie-break).
CREATE OR REPLACE FUNCTION public.fn_aging_invoices(p_property_id uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  student_name text,
  due_date date,
  days_overdue integer,
  aging_bucket text,
  balance_paise bigint,
  status text,
  total_count bigint
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT v.id, v.invoice_number, s.full_name, v.due_date, v.days_overdue, v.aging_bucket, v.balance_paise::bigint, v.status,
         count(*) OVER () AS total_count
    FROM public.v_invoice_aging v
    LEFT JOIN public.students s ON s.id = v.student_id
   WHERE v.property_id = p_property_id AND v.aging_bucket <> 'paid'
   ORDER BY v.days_overdue DESC, v.id
   LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.fn_collection_report(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_aging_buckets(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_aging_invoices(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_collection_report(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aging_buckets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aging_invoices(uuid, integer, integer) TO authenticated;
