-- =============================================================================
-- Student refund request (migration 20261129090000_student_refund_request.sql)
--
-- Same harness style as rls_tests.sql / finance_overdue_refund_tests.sql.
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/student_refund_request_tests.sql
--
-- NOTE: this file has NOT been executed against a real Postgres in this session (no local
-- Supabase stack available here) — it is provided for review/CI, following the same fixture
-- convention as rls_tests.sql (Student 01 = profile 00000000-0000-0000-0000-000000000020,
-- Student 02/peer = 00000000-0000-0000-0000-000000000021, tenant A =
-- 11111111-1111-1111-1111-111111111111, property A1 = 11111111-1111-1111-1111-11111111a001).
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

BEGIN;

-- Fixtures (superuser): one CAPTURED payment each for Student 01 and Student 02 (peer),
-- with no linked invoice (invoice_id is nullable — a standalone fee payment is enough to
-- exercise the refund-request insert path).
INSERT INTO public.payments (id, tenant_id, property_id, student_id, mode, amount_paise, status)
SELECT '99999999-0000-0000-0000-0000000000s1', s.tenant_id, s.property_id, s.id, 'UPI', 500000, 'CAPTURED'
  FROM public.students s WHERE s.profile_id = '00000000-0000-0000-0000-000000000020';

INSERT INTO public.payments (id, tenant_id, property_id, student_id, mode, amount_paise, status)
SELECT '99999999-0000-0000-0000-0000000000s2', s.tenant_id, s.property_id, s.id, 'UPI', 500000, 'CAPTURED'
  FROM public.students s WHERE s.profile_id = '00000000-0000-0000-0000-000000000021';

-- 1. Student submits their own refund request -> succeeds, lands in PENDING_APPROVAL.
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000020","role":"authenticated"}', true);

INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
SELECT p.tenant_id, p.property_id, p.student_id, p.id, 2000, 'Overcharged for mess', 'ORIGINAL_METHOD', 'PENDING_APPROVAL',
       '00000000-0000-0000-0000-000000000020'
  FROM public.payments p WHERE p.id = '99999999-0000-0000-0000-0000000000s1';

SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.refunds WHERE payment_id = '99999999-0000-0000-0000-0000000000s1'
     AND initiated_by = '00000000-0000-0000-0000-000000000020'),
  1, 'Student can submit their own refund request');

-- 2. Student cannot submit a request against another student''s payment (even with their own
--    initiated_by) — the row''s student_id resolves to the peer, which this caller does not own.
SELECT pg_temp.assert_fails(
  $$INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
    SELECT p.tenant_id, p.property_id, p.student_id, p.id, 1000, 'not my payment', 'ORIGINAL_METHOD', 'PENDING_APPROVAL',
           '00000000-0000-0000-0000-000000000020'
      FROM public.payments p WHERE p.id = '99999999-0000-0000-0000-0000000000s2'$$,
  'Student cannot submit a refund request for another student''s payment');

-- 3. Student cannot impersonate another student as initiated_by on their own payment either.
SELECT pg_temp.assert_fails(
  $$INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
    SELECT p.tenant_id, p.property_id, p.student_id, p.id, 1000, 'spoofed initiator', 'ORIGINAL_METHOD', 'PENDING_APPROVAL',
           '00000000-0000-0000-0000-000000000021'
      FROM public.payments p WHERE p.id = '99999999-0000-0000-0000-0000000000s1'$$,
  'Student cannot set initiated_by to someone else');

-- 4. Student cannot slip a request into PENDING_VERIFICATION, nor mark it as a deposit refund
--    (allocation_id / requires_deposit_clearance) — both pinned by the policy's WITH CHECK.
SELECT pg_temp.assert_fails(
  $$INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
    SELECT p.tenant_id, p.property_id, p.student_id, p.id, 1000, 'bypass approval route', 'ORIGINAL_METHOD', 'PENDING_VERIFICATION',
           '00000000-0000-0000-0000-000000000020'
      FROM public.payments p WHERE p.id = '99999999-0000-0000-0000-0000000000s1'$$,
  'Student cannot submit a request with status other than PENDING_APPROVAL');

SELECT pg_temp.assert_fails(
  $$INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by, requires_deposit_clearance)
    SELECT p.tenant_id, p.property_id, p.student_id, p.id, 1000, 'claims deposit clearance', 'ORIGINAL_METHOD', 'PENDING_APPROVAL',
           '00000000-0000-0000-0000-000000000020', true
      FROM public.payments p WHERE p.id = '99999999-0000-0000-0000-0000000000s1'$$,
  'Student cannot mark their request as requiring deposit clearance (deposit refunds stay a staff-only flow)');

-- 5. A student can never approve/reject/complete a refund, including their own request.
SELECT pg_temp.assert_fails(
  $$SELECT public.fn_approve_refund(
      (SELECT id FROM public.refunds WHERE payment_id = '99999999-0000-0000-0000-0000000000s1'
         AND initiated_by = '00000000-0000-0000-0000-000000000020' LIMIT 1),
      'APPROVED', NULL)$$,
  'Student cannot approve their own (or any) refund request — only HOSTEL_ADMIN may');

-- 6. Student still cannot see a peer''s refund requests (pre-existing refunds_student_read policy,
--    re-asserted here against the row created in step 1).
RESET ROLE;
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM public.refunds WHERE payment_id = '99999999-0000-0000-0000-0000000000s1'),
  0, 'A different student cannot see Student 01''s refund request');

RESET ROLE;

ROLLBACK;
