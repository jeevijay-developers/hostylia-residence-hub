-- =============================================================================
-- Query/index sanity checks — Phase 12.
-- Runs EXPLAIN ANALYZE against the four heaviest read paths and asserts the
-- plans use the composite indexes from Architecture.md Sec 26.2.
--
-- Prereqs: supabase/seed.sql must have been applied so the tables have rows
-- (Postgres will otherwise prefer Seq Scan on tiny tables regardless of
-- available indexes).
--
-- Run:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/index_sanity.sql
-- =============================================================================

\echo === 1) Occupancy grid (beds by property/status) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id, b.code, b.status, r.room_number, f.name AS floor
FROM public.beds b
JOIN public.rooms r ON r.id = b.room_id
JOIN public.floors f ON f.id = b.floor_id
WHERE b.tenant_id = '11111111-1111-1111-1111-111111111111'
  AND b.property_id = '11111111-1111-1111-1111-11111111p001'
  AND b.deleted_at IS NULL
ORDER BY f.floor_number, r.room_number, b.code;

\echo === 2) Aging report (open invoices by age bucket) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT status,
       CASE
         WHEN due_date >= current_date THEN 'current'
         WHEN due_date >= current_date - 30 THEN '1-30'
         WHEN due_date >= current_date - 60 THEN '31-60'
         WHEN due_date >= current_date - 90 THEN '61-90'
         ELSE '90+'
       END AS bucket,
       SUM(balance_paise) AS balance
FROM public.invoices
WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
  AND property_id = '11111111-1111-1111-1111-11111111p001'
  AND status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')
  AND deleted_at IS NULL
GROUP BY 1, 2;

\echo === 3) Complaint SLA scan (breach candidates) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, complaint_number, sla_due_at
FROM public.complaints
WHERE deleted_at IS NULL
  AND sla_breached_at IS NULL
  AND status NOT IN ('RESOLVED','CLOSED','CANCELLED')
  AND sla_due_at < now();

\echo === 4) Invoice list for a student (portal) ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, invoice_number, status, total_paise, balance_paise, due_date
FROM public.invoices
WHERE student_id = '11111111-1111-1111-1111-111111110001'
  AND deleted_at IS NULL
ORDER BY due_date DESC
LIMIT 50;

\echo === 5) Attendance history for a student ===
EXPLAIN (ANALYZE, BUFFERS)
SELECT attendance_date, status
FROM public.attendance
WHERE student_id = '11111111-1111-1111-1111-111111110001'
ORDER BY attendance_date DESC
LIMIT 30;

\echo === Interpretation guide ===
\echo   Look for "Index Scan using idx_beds_property_status" (query 1),
\echo   "idx_invoices_property_status" (2 + 4 fallback), "idx_complaints_sla_open" (3),
\echo   and "idx_invoices_student" (4). "Seq Scan" on tables larger than the
\echo   sample sizes below is a red flag; at the seeded volumes (13 beds,
\echo   6 invoices) Seq Scan is normal — Postgres skips indexes on tiny tables.
\echo   Re-run against staging (>1k rows/table) for a real signal.
