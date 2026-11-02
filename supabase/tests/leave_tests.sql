-- =============================================================================
-- Hostylia Student Leave Management assertions
-- (migration 20261102100000_student_leave_management.sql)
--
-- Same harness as rls_tests.sql: runs as postgres, switches role + JWT claims
-- per actor, any failed assertion raises. Everything runs in one transaction
-- that is ROLLED BACK, so no seed data is changed.
--
-- Prereqs:  supabase db reset   (applies migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/leave_tests.sql
--           (or: supabase test db)
--
-- Seed handles used
--   student_01 = ...110001 (profile ..020, block b001, ACTIVE allocation)
--   student_02 = ...110002 (profile ..021, block b001)
--   student_07 = ...110007 (profile ..026, block b002, NOTICE_GIVEN)
--   admin_A = ..010   warden_A_blockA = ..011   warden_A_blockB = ..012
--   accountant_A = ..013   parent_01 = ..040 (linked to student_01)
--   admin_B = ..100 (other tenant)   student_08 (MOVED_OUT) = ...110008
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assume(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role','authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_actual bigint, _expected bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  ELSE
    RAISE NOTICE 'OK  [%] = %', _label, _actual;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_text(_actual text, _expected text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  ELSE
    RAISE NOTICE 'OK  [%] = %', _label, _actual;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_throws(_sql text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  [%] correctly rejected: %', _label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: expected error, statement succeeded', _label;
END $$;

BEGIN;

-- Tenant-A students used below.
--   S1 = student_01, S2 = student_02, block A warden = ..011
\set s1 '11111111-1111-1111-1111-111111110001'
\set s2 '11111111-1111-1111-1111-111111110002'
\set tenantA '11111111-1111-1111-1111-111111111111'
\set propA1 '11111111-1111-1111-1111-11111111a001'

-- =============================================================================
-- 1. Student request: validation + ownership
-- =============================================================================
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- student_01

SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 10, current_date + 9, 'Family function')$sql$,
  'end date before start date rejected');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date - 3, current_date + 1, 'Family function')$sql$,
  'leave starting in the past rejected');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 10, current_date + 11, '  ')$sql$,
  'empty reason rejected');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 10, current_date + 200, 'Too long')$sql$,
  'range over 90 days rejected');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(NULL, current_date + 11, 'Family function')$sql$,
  'missing start date rejected');

-- Valid, inclusive 3-day request (day +40..+42).
SELECT set_config('t.req1', (SELECT (public.request_leave(current_date + 40, current_date + 42, 'Family function', 'Back on the 43rd')).id::text), true);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid AND status = 'PENDING'), 1,
  'student_01 sees own PENDING request');

-- Overlap protection: same range, partial overlap, contained, containing — all blocked.
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 40, current_date + 42, 'Duplicate')$sql$, 'exact duplicate blocked');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 42, current_date + 44, 'Overlap on last day')$sql$, 'overlap on shared end date blocked (inclusive)');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 41, current_date + 41, 'Inside')$sql$, 'contained range blocked');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 39, current_date + 45, 'Containing')$sql$, 'containing range blocked');
-- Adjacent (no shared day) is fine.
SELECT set_config('t.req_adj', (SELECT (public.request_leave(current_date + 43, current_date + 43, 'Adjacent day')).id::text), true);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req_adj')::uuid), 1, 'adjacent non-overlapping request allowed');

-- Direct table writes are impossible for a student (no INSERT/UPDATE/DELETE grant).
SELECT pg_temp.assert_throws(
  $sql$INSERT INTO public.leave_requests (tenant_id, property_id, student_id, allocation_id, start_date, end_date, reason)
       SELECT tenant_id, property_id, student_id, allocation_id, current_date + 90, current_date + 91, 'direct insert'
       FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid$sql$,
  'student cannot INSERT leave_requests directly');
SELECT pg_temp.assert_throws($sql$UPDATE public.leave_requests SET status = 'APPROVED' WHERE id = current_setting('t.req1')::uuid$sql$,
  'student cannot self-approve via UPDATE');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$,
  'student cannot approve own request via RPC');

-- Another student cannot see it, and cannot review it.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000021'); -- student_02
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid), 0,
  'student_02 cannot see student_01 request');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$,
  'student_02 cannot approve student_01 request');

-- Only a student with an active stay may request leave (student_08 is MOVED_OUT).
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000027');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 10, current_date + 11, 'Not eligible')$sql$,
  'moved-out student cannot request leave');

-- =============================================================================
-- 2. Non-student access: parent, accountant, other tenant, wrong-block warden
-- =============================================================================
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000040'); -- parent_01 (child = student_01)
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests), 0, 'parent sees no leave requests');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$, 'parent cannot approve');
SELECT pg_temp.assert_throws($sql$SELECT public.request_leave(current_date + 10, current_date + 11, 'Parent request')$sql$, 'parent cannot request leave');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000013'); -- accountant_A (no attendance grant)
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests), 0, 'accountant without attendance grant sees none');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$, 'accountant cannot approve');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B (other tenant)
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests), 0, 'cross-tenant admin sees none');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$, 'cross-tenant admin cannot approve');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'REJECTED', 'nope nope')$sql$, 'cross-tenant admin cannot reject');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000012'); -- warden Block B (student_01 is Block A)
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid), 0, 'wrong-block warden cannot see request');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')$sql$, 'wrong-block warden cannot approve');

-- =============================================================================
-- 3. Pending / rejected requests do not touch attendance
-- =============================================================================
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE student_id = :'s1' AND leave_request_id IS NOT NULL), 0,
  'PENDING request creates no attendance rows');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden Block A
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid), 1, 'in-scope warden sees request');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req_adj')::uuid, 'REJECTED', '')$sql$, 'rejection without a reason refused');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req_adj')::uuid, 'MAYBE')$sql$, 'unknown decision refused');
SELECT pg_temp.assert_eq((SELECT (public.review_leave_request(current_setting('t.req_adj')::uuid, 'REJECTED', 'Exam day, no leave')).status = 'REJECTED')::int, 1,
  'warden rejects with reason');
SELECT pg_temp.assert_eq((SELECT (public.review_leave_request(current_setting('t.req_adj')::uuid, 'REJECTED', 'Exam day, no leave')).status = 'REJECTED')::int, 1,
  'repeating the same rejection is idempotent');
SELECT pg_temp.assert_throws($sql$SELECT public.review_leave_request(current_setting('t.req_adj')::uuid, 'APPROVED')$sql$, 'decided request cannot be flipped');

RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE student_id = :'s1' AND attendance_date = current_date + 43), 0,
  'REJECTED request creates no attendance row');
-- Rejected request no longer blocks the same dates.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020');
SELECT pg_temp.assert_text((SELECT rejection_reason FROM public.leave_requests WHERE id = current_setting('t.req_adj')::uuid), 'Exam day, no leave',
  'student can read the rejection reason');
SELECT set_config('t.req_again', (SELECT (public.request_leave(current_date + 43, current_date + 43, 'Re-apply after rejection')).id::text), true);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req_again')::uuid), 1, 'rejected dates can be requested again');

-- =============================================================================
-- 4. Approval reconciles attendance (multi-day, conflicting records, idempotent)
-- =============================================================================
-- A pre-existing ABSENT mark on the middle day (+41) and a LATE on day +42.
RESET ROLE;
INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by, notes)
VALUES (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s1', current_date + 41, 'DAILY', 'ABSENT', '00000000-0000-0000-0000-000000000011', 'marked absent earlier'),
       (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s1', current_date + 42, 'DAILY', 'LATE',   '00000000-0000-0000-0000-000000000011', 'came late');
SELECT set_config('t.absent_row', (SELECT id::text FROM public.attendance WHERE student_id = :'s1' AND attendance_date = current_date + 41 AND session = 'DAILY'), true);

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden Block A
SELECT pg_temp.assert_eq((SELECT (public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED')).status = 'APPROVED')::int, 1,
  'in-scope warden approves');

RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance
  WHERE student_id = :'s1' AND status = 'ON_LEAVE' AND leave_request_id = current_setting('t.req1')::uuid
    AND attendance_date BETWEEN current_date + 40 AND current_date + 42), 3,
  'approved 3-day leave shows On Leave on every inclusive date');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE student_id = :'s1' AND attendance_date IN (current_date + 39, current_date + 43) AND status = 'ON_LEAVE'), 0,
  'days outside the range are untouched');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE id = current_setting('t.absent_row')::uuid AND status = 'ON_LEAVE'), 1,
  'conflicting ABSENT row kept (same id), now On Leave');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.audit_logs
  WHERE action = 'LEAVE_RECONCILE' AND entity_type = 'attendance' AND entity_id = current_setting('t.absent_row')::uuid
    AND before_data ->> 'status' = 'ABSENT' AND before_data ->> 'notes' = 'marked absent earlier'), 1,
  'audit log keeps the full previous ABSENT record');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.audit_logs
  WHERE action = 'LEAVE_RECONCILE' AND before_data ->> 'status' = 'LATE' AND (before_data ->> 'student_id')::uuid = :'s1'::uuid), 1,
  'audit log keeps the previous LATE record');

-- Idempotent: approving again changes nothing and adds no audit rows / notifications.
SELECT set_config('t.audit_before', (SELECT count(*)::text FROM public.audit_logs WHERE action = 'LEAVE_RECONCILE'), true);
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011');
SELECT public.review_leave_request(current_setting('t.req1')::uuid, 'APPROVED');
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE student_id = :'s1' AND leave_request_id = current_setting('t.req1')::uuid), 3,
  're-approve leaves exactly 3 leave rows');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.audit_logs WHERE action = 'LEAVE_RECONCILE'), current_setting('t.audit_before')::bigint,
  're-approve writes no new reconcile audit rows');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications WHERE event_type = 'LEAVE_REQUEST_APPROVED'
  AND idempotency_key LIKE 'leave_request:' || current_setting('t.req1') || ':approved:%'), 1,
  'approval notification sent once to the student');

-- A request approved by an Admin works too (tenant-wide admin).
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.leave_requests WHERE id = current_setting('t.req1')::uuid), 1, 'admin sees request');
SELECT pg_temp.assert_eq((SELECT (public.review_leave_request(current_setting('t.req_again')::uuid, 'APPROVED')).status = 'APPROVED')::int, 1,
  'admin approves a request');

-- =============================================================================
-- 5. Attendance guard: leave cannot be overwritten, On Leave cannot be hand-marked
-- =============================================================================
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden Block A
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.attendance SET status = 'PRESENT' WHERE student_id = '11111111-1111-1111-1111-111111110001' AND attendance_date = current_date + 41$sql$,
  'warden cannot flip a leave day to PRESENT');
SELECT pg_temp.assert_throws(
  $sql$INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by)
       VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-11111111b001',
               '11111111-1111-1111-1111-111111110001', current_date + 40, 'MORNING', 'ABSENT', '00000000-0000-0000-0000-000000000011')$sql$,
  'cannot add another session mark on a leave day');
SELECT pg_temp.assert_throws(
  $sql$INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by, source)
       VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-11111111b001',
               '11111111-1111-1111-1111-111111110001', current_date + 40, 'DAILY', 'PRESENT', '00000000-0000-0000-0000-000000000011', 'BULK')
       ON CONFLICT (student_id, attendance_date, session) DO UPDATE SET status = EXCLUDED.status$sql$,
  'Mark All Present style upsert cannot overwrite approved leave');
SELECT pg_temp.assert_throws(
  $sql$INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by)
       VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-11111111b001',
               '11111111-1111-1111-1111-111111110002', current_date + 60, 'DAILY', 'ON_LEAVE', '00000000-0000-0000-0000-000000000011')$sql$,
  'manual On Leave without an approved request is refused');
SELECT pg_temp.assert_throws(
  $sql$DELETE FROM public.attendance WHERE student_id = '11111111-1111-1111-1111-111111110001' AND attendance_date = current_date + 41$sql$,
  'approved-leave attendance cannot be deleted');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- even a Hostel Admin
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.attendance SET status = 'ABSENT' WHERE student_id = '11111111-1111-1111-1111-111111110001' AND attendance_date = current_date + 42$sql$,
  'admin cannot flip a leave day to ABSENT');

-- Normal attendance on a day with no leave still works (existing behaviour intact).
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011');
INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by)
VALUES (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s2', current_date + 40, 'DAILY', 'PRESENT', '00000000-0000-0000-0000-000000000011');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE student_id = :'s2' AND attendance_date = current_date + 40 AND status = 'PRESENT'), 1,
  'attendance for a student not on leave is unaffected');

-- Student sees On Leave in their own history.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE status = 'ON_LEAVE' AND student_id = :'s1'), 3 + 1,
  'student_01 sees On Leave on approved dates (3 + the re-applied day +43)');

-- =============================================================================
-- 6. Attendance %: (Present + Late) / (Present + Late + Absent); leave excluded
-- =============================================================================
-- Fresh month far from the rows above: leave on days 10-12 (approved), plus
-- PRESENT x2, LATE x1, ABSENT x1 on days 1-4  =>  3 / 4 = 75.00 %.
-- (A leave counted in the denominator would give 3/7 = 42.86 %.)
RESET ROLE;
SELECT set_config('t.m', (date_trunc('month', current_date + interval '3 months'))::date::text, true);

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000021'); -- student_02
SELECT set_config('t.req_pct', (SELECT (public.request_leave(current_setting('t.m')::date + 9, current_setting('t.m')::date + 11, 'Wedding')).id::text), true);
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011');
SELECT public.review_leave_request(current_setting('t.req_pct')::uuid, 'APPROVED');
INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, session, status, marked_by, notes)
VALUES (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s2', current_setting('t.m')::date + 0, 'DAILY', 'PRESENT', '00000000-0000-0000-0000-000000000011', NULL),
       (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s2', current_setting('t.m')::date + 1, 'DAILY', 'PRESENT', '00000000-0000-0000-0000-000000000011', NULL),
       (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s2', current_setting('t.m')::date + 2, 'DAILY', 'LATE',    '00000000-0000-0000-0000-000000000011', 'late'),
       (:'tenantA', :'propA1', '11111111-1111-1111-1111-11111111b001', :'s2', current_setting('t.m')::date + 3, 'DAILY', 'ABSENT',  '00000000-0000-0000-0000-000000000011', 'absent');

SELECT pg_temp.assert_text(
  (SELECT attendance_pct::text FROM public.v_attendance_monthly_summary WHERE student_id = :'s2' AND month = current_setting('t.m')::date),
  '75.00', 'attendance % = (Present + Late) / (Present + Late + Absent), leave excluded');
SELECT pg_temp.assert_eq((SELECT leave_days FROM public.v_attendance_monthly_summary WHERE student_id = :'s2' AND month = current_setting('t.m')::date), 3,
  'leave days reported separately (3 inclusive days)');
SELECT pg_temp.assert_eq((SELECT late_days FROM public.v_attendance_monthly_summary WHERE student_id = :'s2' AND month = current_setting('t.m')::date), 1,
  'Late still reported separately');
SELECT pg_temp.assert_eq((SELECT present_days FROM public.v_attendance_monthly_summary WHERE student_id = :'s2' AND month = current_setting('t.m')::date), 2,
  'present_days stays Present-only');

-- Month with only leave => no percentage (denominator 0), not 0% / not an error.
RESET ROLE;
SELECT pg_temp.assert_eq(
  (SELECT (count(*) >= 1)::int FROM public.v_attendance_monthly_summary
   WHERE student_id = :'s1' AND month >= date_trunc('month', current_date + 40)::date
     AND (present_days + late_days + absent_days) = 0 AND leave_days > 0 AND attendance_pct IS NULL), 1,
  'a month with only leave days has a NULL percentage (not 0%)');

-- Student sees their own summary; another student does not see it.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000021');
SELECT pg_temp.assert_text(
  (SELECT attendance_pct::text FROM public.v_attendance_monthly_summary WHERE month = current_setting('t.m')::date),
  '75.00', 'student sees own % through the security_invoker view');
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.v_attendance_monthly_summary WHERE student_id = :'s2'), 0,
  'student_01 cannot read student_02 summary');

-- =============================================================================
-- 7. Notifications
-- =============================================================================
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications
  WHERE event_type = 'LEAVE_REQUEST_SUBMITTED' AND recipient_user_id = '00000000-0000-0000-0000-000000000010'
    AND idempotency_key LIKE 'leave_request:' || current_setting('t.req1') || ':submitted:%'), 1,
  'admin notified of submission');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications
  WHERE event_type = 'LEAVE_REQUEST_SUBMITTED' AND recipient_user_id = '00000000-0000-0000-0000-000000000011'
    AND idempotency_key LIKE 'leave_request:' || current_setting('t.req1') || ':submitted:%'), 1,
  'in-scope warden notified of submission');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications
  WHERE event_type = 'LEAVE_REQUEST_SUBMITTED' AND recipient_user_id = '00000000-0000-0000-0000-000000000012'
    AND idempotency_key LIKE 'leave_request:' || current_setting('t.req1') || ':submitted:%'), 0,
  'wrong-block warden NOT notified');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications
  WHERE event_type = 'LEAVE_REQUEST_REJECTED' AND recipient_user_id = '00000000-0000-0000-0000-000000000020'), 1,
  'student notified of rejection');

ROLLBACK;
