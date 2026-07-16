
-- Phase 9 Reports: plain views with security_invoker so underlying RLS applies.

-- 1) Occupancy summary per property + block
CREATE OR REPLACE VIEW public.v_occupancy_summary
WITH (security_invoker = true) AS
SELECT
  b.tenant_id,
  b.property_id,
  b.block_id,
  COUNT(*)::int                                                              AS total_beds,
  COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::int                         AS occupied_beds,
  COUNT(*) FILTER (WHERE b.status = 'VACANT')::int                           AS vacant_beds,
  COUNT(*) FILTER (WHERE b.status = 'MAINTENANCE')::int                      AS maintenance_beds,
  COUNT(*) FILTER (WHERE b.status = 'BLOCKED')::int                          AS blocked_beds,
  CASE WHEN COUNT(*) FILTER (WHERE b.status IN ('OCCUPIED','VACANT')) = 0 THEN 0
       ELSE ROUND(
         COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::numeric * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE b.status IN ('OCCUPIED','VACANT')), 0),
         2)
  END                                                                        AS occupancy_pct
FROM public.beds b
WHERE b.deleted_at IS NULL
GROUP BY b.tenant_id, b.property_id, b.block_id;

GRANT SELECT ON public.v_occupancy_summary TO authenticated;

-- 2) Invoice aging (per-invoice with bucket) — shared source of truth
CREATE OR REPLACE VIEW public.v_invoice_aging
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.tenant_id,
  i.property_id,
  i.student_id,
  i.invoice_number,
  i.issue_date,
  i.due_date,
  i.status,
  i.total_paise,
  i.paid_paise,
  i.balance_paise,
  GREATEST(0, (CURRENT_DATE - i.due_date))::int AS days_overdue,
  CASE
    WHEN i.balance_paise <= 0 OR i.status IN ('PAID','VOID','REFUNDED') THEN 'paid'
    WHEN i.due_date >= CURRENT_DATE THEN 'current'
    WHEN (CURRENT_DATE - i.due_date) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - i.due_date) <= 60 THEN '31-60'
    ELSE '60+'
  END AS aging_bucket
FROM public.invoices i
WHERE i.deleted_at IS NULL;

GRANT SELECT ON public.v_invoice_aging TO authenticated;

-- 3) Complaint SLA compliance summary per property + category + assignee
CREATE OR REPLACE VIEW public.v_complaint_sla_summary
WITH (security_invoker = true) AS
SELECT
  c.tenant_id,
  c.property_id,
  c.category_id,
  c.assigned_to,
  COUNT(*)::int AS total_complaints,
  COUNT(*) FILTER (
    WHERE c.status IN ('RESOLVED','CLOSED')
      AND c.resolved_at IS NOT NULL
      AND c.resolved_at <= c.sla_due_at
  )::int AS resolved_within_sla,
  COUNT(*) FILTER (WHERE c.sla_breached_at IS NOT NULL)::int AS breached,
  COUNT(*) FILTER (WHERE c.status IN ('RESOLVED','CLOSED'))::int AS resolved_total,
  CASE WHEN COUNT(*) FILTER (WHERE c.status IN ('RESOLVED','CLOSED')) = 0 THEN NULL
       ELSE ROUND(
         COUNT(*) FILTER (
           WHERE c.status IN ('RESOLVED','CLOSED')
             AND c.resolved_at IS NOT NULL
             AND c.resolved_at <= c.sla_due_at
         )::numeric * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE c.status IN ('RESOLVED','CLOSED')), 0),
         2)
  END AS sla_compliance_pct
FROM public.complaints c
WHERE c.deleted_at IS NULL
GROUP BY c.tenant_id, c.property_id, c.category_id, c.assigned_to;

GRANT SELECT ON public.v_complaint_sla_summary TO authenticated;
