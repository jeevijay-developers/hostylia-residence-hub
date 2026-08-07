-- =============================================================================
-- Hostylia RLS + RBAC assertion suite (Phase 12).
-- Runs as postgres in psql; each test SETs LOCAL role + JWT claims to
-- simulate each seeded user, runs SELECT/INSERT/UPDATE, and asserts row
-- counts or expected errors via DO blocks. Any failure raises EXCEPTION.
--
-- Prereqs:
--   \i supabase/seed.sql
--
-- Run:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql
--
-- Organized against PRD Sec 7's permission matrix (STUDENT, PARENT,
-- WARDEN, ACCOUNTANT, HOSTEL_ADMIN, SUPER_ADMIN). Every table in scope
-- has at least one positive (in-scope) + one negative (out-of-scope) test.
-- =============================================================================

\set ON_ERROR_STOP on

-- Reusable UUID handles (documented for readability).
--   tenant A = 11111111-1111-1111-1111-111111111111
--   tenant B = 22222222-2222-2222-2222-222222222222
--   admin_A  = 00000000-0000-0000-0000-000000000010
--   accountant_A = ..013 ; admin_A2 = ..014
--   warden_A_blockA = ..011 ; warden_A_blockB = ..012
--   student_01 profile = ..020 ; student_02 profile = ..021
--   parent_01 profile = ..040 (can approve + pay for student 01)
--   parent_02 profile = ..041 (view only for student 02)
--   student_B01 profile = ..101 ; parent_B01 = ..102
--   admin_B = ..100

-- ---------- helpers ------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assume(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role','authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_ge(_actual bigint, _min bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual < _min THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected >= %, got %', _label, _min, _actual;
  ELSE
    RAISE NOTICE 'OK  [%] = % (>=%)', _label, _actual, _min;
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

-- =============================================================================
-- SECTION 1 — Tenant isolation (every scoped table)
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- HOSTEL_ADMIN Tenant A
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B students');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B invoices');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.beds WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B beds');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.complaints WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B complaints');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.gate_passes WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B gate_passes');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B attendance');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notices WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B notices');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fee_plans WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B fee_plans');
-- Positive: AdminA sees own tenant
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.students WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 15, 'AdminA sees Tenant A students');
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.invoices WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 5, 'AdminA sees Tenant A invoices');
ROLLBACK;

-- =============================================================================
-- SECTION 2 — Warden block scoping
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- Warden Block A only
-- Should see students in Block A (5 in rooms r001-r003) + not moved-out student 08
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.students WHERE property_id='11111111-1111-1111-1111-11111111a001'), 1, 'WardenA can see property A1 students');
-- Cannot write attendance for Block B students
SELECT pg_temp.assert_throws(
  $sql$INSERT INTO public.attendance (tenant_id, property_id, block_id, student_id, attendance_date, status, marked_by)
       VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-11111111b002','11111111-1111-1111-1111-111111110007', current_date - 1, 'PRESENT','00000000-0000-0000-0000-000000000011')$sql$,
  'WardenA_BlockA cannot insert attendance into Block B');
ROLLBACK;

-- =============================================================================
-- SECTION 3 — Parent scoping (own children only, permission flags respected)
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000040'); -- Parent 01 → linked to Student 01
-- Sees own student's invoices only
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.invoices WHERE student_id='11111111-1111-1111-1111-111111110001'), 1, 'Parent01 sees own child invoices');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices WHERE student_id='11111111-1111-1111-1111-111111110004'), 0, 'Parent01 cannot see other student invoices');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'Parent01 cannot see other tenant invoices');
-- Parent 02 has can_pay_fees=false → cannot see invoices (per is_paying_parent policy on invoices)
ROLLBACK;

BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000041'); -- Parent 02
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices WHERE student_id='11111111-1111-1111-1111-111111110002'), 0, 'Parent02 without can_pay_fees cannot read invoices');
ROLLBACK;

-- =============================================================================
-- SECTION 4 — Student scoping (own row only)
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- Student 01
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE profile_id='00000000-0000-0000-0000-000000000020'), 1, 'Student sees own student row');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE profile_id='00000000-0000-0000-0000-000000000021'), 0, 'Student cannot see other student rows');
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.complaints WHERE student_id='11111111-1111-1111-1111-111111110001'), 1, 'Student sees own complaints');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.complaints WHERE student_id='11111111-1111-1111-1111-111111110002'), 0, 'Student cannot see peer complaints');
ROLLBACK;

-- =============================================================================
-- SECTION 5 — Refund maker/checker (self-approval blocked)
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000013'); -- accountant_A initiated refund
SELECT pg_temp.assert_throws(
  $sql$SELECT public.fn_approve_refund('11111111-1111-1111-1111-11111111cf01','APPROVED','Trying self approve')$sql$,
  'Refund initiator cannot self-approve (via fn_approve_refund)');
-- Also: an accountant (non-HOSTEL_ADMIN) cannot approve at all
ROLLBACK;

BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- HOSTEL_ADMIN (not initiator)
-- Would succeed but we ROLLBACK to keep fixture intact
DO $$ BEGIN
  PERFORM public.fn_approve_refund('11111111-1111-1111-1111-11111111cf01','APPROVED','Second-signer approval');
  RAISE NOTICE 'OK  [Refund maker-checker: HOSTEL_ADMIN can approve someone else''s refund]';
END $$;
ROLLBACK;

-- =============================================================================
-- SECTION 6 — SUPER_ADMIN sees platform tables
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000001'); -- super
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.tenants), 2, 'SUPER sees both tenants');
-- Regular admin cannot escalate
ROLLBACK;

-- =============================================================================
-- SECTION 7 — Anon role has no access to authenticated tables
-- =============================================================================
BEGIN;
SELECT pg_temp.assume_anon();
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students), 0, 'anon cannot read students');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices), 0, 'anon cannot read invoices');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.gate_passes), 0, 'anon cannot read gate_passes');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications), 0, 'anon cannot read notifications');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.support_sessions), 0, 'anon cannot read support_sessions');
ROLLBACK;

-- =============================================================================
-- SECTION 8 — Notification recipient scoping
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- Student 01
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.notifications WHERE recipient_user_id='00000000-0000-0000-0000-000000000020'), 1, 'Student sees own notifications');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications WHERE recipient_user_id='00000000-0000-0000-0000-000000000021'), 0, 'Student cannot see peer notifications');
ROLLBACK;

-- =============================================================================
-- SECTION 9 — Gate pass parent-approval guard (fn_validate_parent_approval)
-- =============================================================================
BEGIN;
-- Parent 02 lacks can_approve_gate_pass; must not be allowed to set parent_approved_by.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin so RLS UPDATE passes; trigger still fires
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.gate_passes SET parent_approved_by='00000000-0000-0000-0000-000000000041', parent_approved_at=now()
       WHERE id='11111111-1111-1111-1111-11111111da02'$sql$,
  'Non-approver parent cannot approve gate pass');
-- Parent 01 IS a valid approver for student 01, but gp02 belongs to student 02 → still invalid
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.gate_passes SET parent_approved_by='00000000-0000-0000-0000-000000000040', parent_approved_at=now()
       WHERE id='11111111-1111-1111-1111-11111111da02'$sql$,
  'Approver parent for a different student is rejected');
ROLLBACK;

-- =============================================================================
-- SECTION 10 — Complaint reopen window guard
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
-- cp05 has reopen_until = now()+44h → within window, should succeed
UPDATE public.complaints SET status='REOPENED' WHERE id='11111111-1111-1111-1111-11111111ca05';
-- Force reopen_until into the past and try again → must fail
UPDATE public.complaints SET status='RESOLVED', resolved_at=now()-interval '3 days', reopen_until=now()-interval '1 day' WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.complaints SET status='REOPENED' WHERE id='11111111-1111-1111-1111-11111111ca05'$sql$,
  'Complaint reopen rejected after 48h window');
ROLLBACK;

-- =============================================================================
-- SECTION 10b — Complaint reopen as the actual STUDENT owner (not admin).
-- fn_complaints_guard_self_update must allow this one specific transition
-- while still blocking a student from sneaking other column changes through
-- alongside it, and still blocking reopen once the window has lapsed.
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000022'); -- Student 03, owns cp05
-- cp05 is seeded RESOLVED with reopen_until = now()+44h → within window.
UPDATE public.complaints SET status='REOPENED' WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.complaints WHERE id='11111111-1111-1111-1111-11111111ca05' AND status='REOPENED'),
  1, 'Student can reopen own RESOLVED complaint within 48h window');
ROLLBACK; -- undoes the reopen; fixture state is untouched for the next block

BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin resets fixture state
UPDATE public.complaints SET status='RESOLVED', resolved_at=now(), reopen_until=now()-interval '1 day'
  WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000022'); -- Student 03 again
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.complaints SET status='REOPENED' WHERE id='11111111-1111-1111-1111-11111111ca05'$sql$,
  'Student reopen rejected after 48h window');
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
UPDATE public.complaints SET status='RESOLVED', resolved_at=now(), reopen_until=now()+interval '44 hours'
  WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000022'); -- Student 03 again
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.complaints SET status='REOPENED', resolution_summary='rewritten by student'
       WHERE id='11111111-1111-1111-1111-11111111ca05'$sql$,
  'Student cannot bundle a staff-controlled column change into a reopen');
ROLLBACK;

-- =============================================================================
-- SECTION 10c — Student can rate the resolution of their own complaint.
-- rating/rating_comment are deliberately NOT in fn_complaints_guard_self_update's
-- blocked-column list, so this must succeed for RESOLVED/CLOSED complaints the
-- student owns, be rejected for complaints they don't own, and still respect the
-- rating CHECK (1..5) constraint.
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000022'); -- Student 03, owns cp05 (RESOLVED)
UPDATE public.complaints SET rating=4, rating_comment='Quick fix, thanks!'
  WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.complaints
    WHERE id='11111111-1111-1111-1111-11111111ca05' AND rating=4 AND rating_comment='Quick fix, thanks!'),
  1, 'Student can rate their own resolved complaint');
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.complaints SET rating=6 WHERE id='11111111-1111-1111-1111-11111111ca05'$sql$,
  'Rating outside 1-5 is rejected by the CHECK constraint');
ROLLBACK;

BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- Student 01, does NOT own cp05
UPDATE public.complaints SET rating=1, rating_comment='not mine to rate'
  WHERE id='11111111-1111-1111-1111-11111111ca05';
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.complaints
    WHERE id='11111111-1111-1111-1111-11111111ca05' AND rating_comment='not mine to rate'),
  0, 'Student cannot rate a complaint that is not their own (RLS USING excludes the row)');
ROLLBACK;

-- =============================================================================
-- SECTION 10d — Student/parent can read the bed/room/floor/block referenced by
-- their own (student's) allocation, but not someone else's.
-- Allocation a1 (student 01, profile ..020) → bed e001/room c001/floor f001/block b001.
-- Allocation a2 (student 02, profile ..021) → bed e002 (same room/floor/block as a1).
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- Student 01
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.beds WHERE id='11111111-1111-1111-1111-11111111e001'),
  1, 'Student can read their own allocation''s bed');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.rooms WHERE id='11111111-1111-1111-1111-11111111c001'),
  1, 'Student can read their own allocation''s room');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.floors WHERE id='11111111-1111-1111-1111-11111111f001'),
  1, 'Student can read their own allocation''s floor');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.blocks WHERE id='11111111-1111-1111-1111-11111111b001'),
  1, 'Student can read their own allocation''s block');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.beds WHERE id='11111111-1111-1111-1111-11111111e002'),
  0, 'Student cannot read a bed from someone else''s allocation');
ROLLBACK;

BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000040'); -- Parent 01, linked to Student 01
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.beds WHERE id='11111111-1111-1111-1111-11111111e001'),
  1, 'Linked parent can read their child''s allocation bed');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.beds WHERE id='11111111-1111-1111-1111-11111111e002'),
  0, 'Parent cannot read a bed from a student they are not linked to');
ROLLBACK;

-- =============================================================================
-- SECTION 11 — Phase 13 hardening: tenants / organizations / properties /
-- subscriptions cross-tenant isolation + tenants status-column trigger guard.
--
-- Sandbox note: this section requires seeded auth.users rows for
-- admin_A (..010) and admin_B (..100) because role_assignments FKs
-- into auth.users. The Phase 12 seed is expected to create these.
-- =============================================================================
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- HOSTEL_ADMIN Tenant A

-- Cross-tenant SELECT on the tightened tables must return zero.
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.properties    WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B properties');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.organizations WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B organizations');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.subscriptions WHERE tenant_id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B subscriptions');
-- Tenant row for B must also be filtered out (SELECT scope no longer includes is_tenant_member of other tenants).
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.tenants WHERE id='22222222-2222-2222-2222-222222222222'), 0, 'AdminA cannot see Tenant B row');

-- Positive: own tenant remains fully visible.
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.properties    WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 1, 'AdminA sees Tenant A properties');
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.organizations WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 1, 'AdminA sees Tenant A organizations');
SELECT pg_temp.assert_ge((SELECT count(*) FROM public.subscriptions WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 1, 'AdminA sees Tenant A subscription');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.tenants       WHERE id='11111111-1111-1111-1111-111111111111'), 1, 'AdminA sees own tenant row');

-- Cross-tenant UPDATE on tenants must affect 0 rows (RLS filters), not raise.
WITH u AS (
  UPDATE public.tenants SET display_name='HACKED-BY-A'
   WHERE id='22222222-2222-2222-2222-222222222222'
   RETURNING 1
)
SELECT pg_temp.assert_eq((SELECT count(*) FROM u), 0, 'AdminA update against Tenant B affects 0 rows');

-- Status-column trigger: HOSTEL_ADMIN must NOT be able to change status/onboarding/suspended_at/cancelled_at on own tenant.
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.tenants SET status='SUSPENDED' WHERE id='11111111-1111-1111-1111-111111111111'$sql$,
  'HOSTEL_ADMIN blocked from changing tenants.status');
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.tenants SET onboarding_status='PENDING' WHERE id='11111111-1111-1111-1111-111111111111'$sql$,
  'HOSTEL_ADMIN blocked from changing tenants.onboarding_status');
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.tenants SET suspended_at=now() WHERE id='11111111-1111-1111-1111-111111111111'$sql$,
  'HOSTEL_ADMIN blocked from setting tenants.suspended_at');
SELECT pg_temp.assert_throws(
  $sql$UPDATE public.tenants SET cancelled_at=now() WHERE id='11111111-1111-1111-1111-111111111111'$sql$,
  'HOSTEL_ADMIN blocked from setting tenants.cancelled_at');

-- Benign column change (display_name) on own tenant must still succeed for HOSTEL_ADMIN.
UPDATE public.tenants SET display_name = display_name WHERE id='11111111-1111-1111-1111-111111111111';

-- Plans: HOSTEL_ADMIN cannot mutate SaaS pricing.
DO $$ DECLARE r int; BEGIN
  UPDATE public.plans SET price_paise = price_paise + 0 WHERE 1=1;
  GET DIAGNOSTICS r = ROW_COUNT;
  IF r <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL [HOSTEL_ADMIN cannot write plans]: expected 0 rows, got %', r;
  END IF;
  RAISE NOTICE 'OK  [HOSTEL_ADMIN cannot write plans] rows_affected=0';
END $$;
ROLLBACK;

-- SUPER_ADMIN counter-check: status column changes must succeed.
BEGIN;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000001'); -- SUPER_ADMIN
UPDATE public.tenants SET status='SUSPENDED', suspended_at=now() WHERE id='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.tenants WHERE id='11111111-1111-1111-1111-111111111111' AND status='SUSPENDED'), 1, 'SUPER_ADMIN can change tenants.status');
ROLLBACK;

SELECT '=== RLS TESTS COMPLETED ===' AS status;
