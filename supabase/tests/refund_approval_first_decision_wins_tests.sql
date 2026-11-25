-- =============================================================================
-- Refund approval — Option A first-decision-wins, multiple Hostel Admins
-- (Part 3 of the refund workflow: no new migration, this verifies the EXISTING
-- fn_approve_refund from 20260715142229_eda24da4-86c8-4581-b0b8-8a393877b8df.sql
-- already satisfies the business rule as-is).
--
-- Same harness style as rls_tests.sql / finance_overdue_refund_tests.sql.
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/refund_approval_first_decision_wins_tests.sql
--
-- NOTE: this file has NOT been executed against a real Postgres in this session (no local
-- Supabase stack available here) — provided for review/CI. Fixtures follow rls_tests.sql's
-- documented seed: tenant A = 11111111-1111-1111-1111-111111111111,
-- admin_A = 00000000-0000-0000-0000-000000000010, admin_A2 = ..014 (a SECOND active
-- HOSTEL_ADMIN already seeded for the same tenant — exactly the "multiple Hostel Admins"
-- scenario), accountant_A = ..013.
--
-- A true concurrent-transaction race (two sessions blocked on the same row lock at once)
-- needs two separate psql connections / pgbench, which a single linear script can't drive.
-- What's demonstrated here is the actual mechanism fn_approve_refund relies on: it takes
-- `SELECT ... FOR UPDATE` on the refund row, then re-checks `status IN ('PENDING_APPROVAL',
-- 'DRAFT')` inside that same locked read. A second caller blocked on the lock sees the
-- already-decided status the instant it acquires the lock after the first commits — so
-- "decide, then attempt to decide again" (as below) exercises the same guard a real
-- concurrent race would hit; the row lock is what makes two *simultaneous* calls behave
-- identically to two *sequential* ones instead of corrupting each other.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_actual bigint, _expected bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  END IF;
  RAISE NOTICE 'OK  [%] = %', _label, _actual;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_text(_actual text, _expected text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  END IF;
  RAISE NOTICE 'OK  [%] = %', _label, _actual;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_fails(_sql text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  [%] rejected (%): %', _label, SQLSTATE, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: statement succeeded but should have failed', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assume(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
END $$;

BEGIN;

-- Fixtures (superuser): four plain CAPTURED payments + four PENDING_APPROVAL refunds
-- against Student 01 in Tenant A, one per scenario below.
INSERT INTO public.payments (id, tenant_id, property_id, student_id, mode, amount_paise, status)
SELECT ('99999999-0000-0000-0000-00000000a0' || n)::uuid, s.tenant_id, s.property_id, s.id, 'UPI', 500000, 'CAPTURED'
  FROM public.students s, generate_series(1, 4) n
 WHERE s.profile_id = '00000000-0000-0000-0000-000000000020';

INSERT INTO public.refunds (id, tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
SELECT ('99999999-0000-0000-0000-00000000b0' || n)::uuid, p.tenant_id, p.property_id, p.student_id, p.id, 1000,
       'scenario ' || n, 'ORIGINAL_METHOD', 'PENDING_APPROVAL', '00000000-0000-0000-0000-000000000013'
  FROM public.payments p, generate_series(1, 4) n
 WHERE p.id = ('99999999-0000-0000-0000-00000000a0' || n)::uuid;

-- ---------------------------------------------------------------------------
-- 1. AdminA approves refund #1. AdminA2 (a DIFFERENT, second active HOSTEL_ADMIN
--    on the SAME tenant) then tries to decide the same request afterwards.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- AdminA
SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b01', 'APPROVED', 'Looks fine');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b01'),
  'APPROVED', 'AdminA''s approval is recorded');
SELECT pg_temp.assert_text((SELECT decision_reason FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b01'),
  'Looks fine', 'decision note is stored');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b01'
  AND approved_by = '00000000-0000-0000-0000-000000000010'), 1, 'approved_by records the deciding admin');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000014'); -- AdminA2, a second HOSTEL_ADMIN, same tenant
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b01', 'REJECTED', 'too late')$$,
  'A second Hostel Admin cannot overturn a decision another Hostel Admin already made (first decision wins)');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b01'),
  'APPROVED', 'the original decision is still final, unchanged');

-- ---------------------------------------------------------------------------
-- 2. AdminA2 rejects refund #2. AdminA then tries to approve the same
--    already-decided request.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000014'); -- AdminA2
SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b02', 'REJECTED', 'Not eligible');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b02'),
  'REJECTED', 'AdminA2''s rejection is recorded');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- AdminA
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b02', 'APPROVED', 'overrule')$$,
  'A rejected request cannot later be approved by a different Hostel Admin');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b02'),
  'REJECTED', 'rejection remains final');

-- ---------------------------------------------------------------------------
-- 3. Accountant cannot approve/reject refund #3, even via a direct RPC call
--    (not just "no button in the UI").
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000013'); -- Accountant_A
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b03', 'APPROVED', 'accountant tries anyway')$$,
  'Accountant cannot approve a refund via direct RPC call');
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b03', 'REJECTED', 'accountant tries anyway')$$,
  'Accountant cannot reject a refund via direct RPC call either');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b03'),
  'PENDING_APPROVAL', 'refund #3 is still untouched, pending a real Hostel Admin decision');

-- ---------------------------------------------------------------------------
-- 4. Self-approval: a Hostel Admin cannot approve a refund THEY initiated.
--    (refund #4 was initiated by Accountant_A above; re-use it to also check
--    that an admin who did NOT initiate it can approve normally.)
-- ---------------------------------------------------------------------------
UPDATE public.refunds SET initiated_by = '00000000-0000-0000-0000-000000000010'
  WHERE id = '99999999-0000-0000-0000-00000000b04'; -- AdminA is now the initiator of this one

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- AdminA, the initiator
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b04', 'APPROVED', 'self-approve')$$,
  'A Hostel Admin cannot approve a refund they themselves initiated');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000014'); -- AdminA2, a different admin, did not initiate it
SELECT public.fn_approve_refund('99999999-0000-0000-0000-00000000b04', 'APPROVED', 'reviewed, fine');
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-00000000b04'),
  'APPROVED', 'a different Hostel Admin (not the initiator) can approve it normally');

ROLLBACK;
