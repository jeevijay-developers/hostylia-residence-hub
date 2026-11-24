-- Admin/Warden Finance Overview: daily & monthly collection series for the charts.
--
-- Same cohort rule as fn_collection_report (20261124090000, left untouched): invoices issued within
-- [p_from, p_to] (inclusive; property-scoped, not deleted, not DRAFT/VOID, and not fully refunded —
-- recognised by status AND by money so a stale status can't let one slip in). Received/Refunded are
-- read from payments/refunds directly, exactly as fn_collection_report reads them, just grouped by the
-- day or month of the invoice's issue_date instead of collapsed into one total — so
-- sum(received_paise) - sum(refunded_paise) across every bucket this function returns for a given
-- [p_from, p_to] is always exactly fn_collection_report(...).collected_paise for the same arguments.
-- Buckets with no eligible invoice still appear with zeros, so the chart's x-axis has no gaps.
--
-- Read-only, SECURITY INVOKER (the default): RLS on invoices/payments/refunds applies exactly as for
-- fn_collection_report, so a caller sees only what they could already see there.
CREATE OR REPLACE FUNCTION public.fn_collection_series(
  p_property_id uuid,
  p_from date,
  p_to date,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
  period date,
  received_paise bigint,
  refunded_paise bigint,
  collected_paise bigint
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.fn_collection_series(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_collection_series(uuid, date, date, text) TO authenticated;
