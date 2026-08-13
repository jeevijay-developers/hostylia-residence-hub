-- Monthly Attendance Report: per-student, per-calendar-month roll-up.
-- security_invoker so the caller's own RLS on `attendance` applies —
-- Admin sees property-wide, Warden sees their assigned property/block
-- (att_warden_write is FOR ALL, so it already gates SELECT too), Student
-- sees only their own rows (att_student_read), Parent sees only a linked,
-- attendance-permitted child's rows (att_parent_read). No new grants beyond
-- what those existing policies already allow — this view adds no access.
CREATE OR REPLACE VIEW public.v_attendance_monthly_summary
WITH (security_invoker = true) AS
SELECT
  a.tenant_id,
  a.property_id,
  a.block_id,
  a.student_id,
  date_trunc('month', a.attendance_date)::date AS month,
  COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int    AS present_days,
  COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int      AS absent_days,
  COUNT(*) FILTER (WHERE a.status = 'LATE')::int        AS late_days,
  COUNT(*) FILTER (WHERE a.status = 'ON_LEAVE')::int    AS leave_days,
  COUNT(*) FILTER (WHERE a.status = 'OUT_PASS')::int    AS out_pass_days,
  COUNT(*) FILTER (WHERE a.status != 'NOT_MARKED')::int AS marked_days,
  CASE WHEN COUNT(*) FILTER (WHERE a.status != 'NOT_MARKED') = 0 THEN NULL
       ELSE ROUND(
         COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::numeric * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE a.status != 'NOT_MARKED'), 0),
         2)
  END AS attendance_pct
FROM public.attendance a
GROUP BY a.tenant_id, a.property_id, a.block_id, a.student_id, date_trunc('month', a.attendance_date);

GRANT SELECT ON public.v_attendance_monthly_summary TO authenticated;
