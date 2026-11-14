-- =============================================================================
-- Duplicate student prevention assertions
-- (migration 20261106090000_student_duplicate_prevention.sql)
--
-- Same harness as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/student_duplicate_tests.sql
--
-- NOT covered here: two sessions racing the same phone/email. That needs two
-- concurrent connections; the guard serialises them with a transaction-scoped
-- advisory lock (see the migration) so the loser re-reads after the winner commits.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_actual bigint, _expected bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  ELSE
    RAISE NOTICE 'OK  [%] = %', _label, _actual;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(_sql text, _state text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = _state THEN
      RAISE NOTICE 'OK  [%] rejected with %: %', _label, SQLSTATE, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected SQLSTATE %, got % (%)', _label, _state, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: expected error %, statement succeeded', _label, _state;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reg(_n text, _phone text, _email text, _gphone text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.fn_register_student(
    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-11111111a001',
    'DUP-' || _n, 'Dup ' || _n, _phone, _email, NULL, NULL, NULL, NULL, NULL, false, '{}'::jsonb,
    'Parent', _gphone, 'Father', false);
$$;

BEGIN;

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true); -- admin_A

SELECT pg_temp.reg('1', '+91 98111 11111', 'Dup1@X.com', '+919822222222');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE admission_number = 'DUP-1'), 1, 'first registration succeeds');

SELECT pg_temp.assert_sqlstate($$SELECT pg_temp.reg('2', '9811111111', NULL, '+919822222222')$$, '23505', 'same phone in another format refused');
SELECT pg_temp.assert_sqlstate($$SELECT pg_temp.reg('3', NULL, ' dup1@x.COM ', '+919822222222')$$, '23505', 'same email (case/whitespace) refused');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE admission_number IN ('DUP-2','DUP-3')), 0, 'refused registrations leave no student row');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.guardians WHERE phone = '+919822222222'), 1, 'and no extra guardian');

-- siblings of one parent are fine: the guardian phone is not student identity
SELECT pg_temp.reg('4', '9833333333', 'dup4@x.com', '+919822222222');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.guardians WHERE phone = '+919822222222'), 1, 'sibling reuses the existing guardian');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.student_guardians WHERE guardian_id = (SELECT id FROM public.guardians WHERE phone = '+919822222222')), 2, 'one guardian, two students');

-- tenant scope: tenant B may register the same phone
RESET ROLE;
SELECT pg_temp.assert_eq((WITH i AS (
  INSERT INTO public.students (tenant_id, property_id, admission_number, full_name, phone)
  VALUES ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-22222222a001','DUP-B','Dup B','9811111111') RETURNING 1
) SELECT count(*) FROM i), 1, 'same phone in another tenant is allowed');

-- archived students do not hold their identifiers
UPDATE public.students SET deleted_at = now() WHERE admission_number = 'DUP-1';
SELECT pg_temp.reg('5', '9811111111', 'dup1@x.com', '+919822222222');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE admission_number = 'DUP-5'), 1, 'archived student no longer blocks a new registration');
SELECT pg_temp.assert_sqlstate($$UPDATE public.students SET deleted_at = NULL WHERE admission_number = 'DUP-1'$$, '23505', 'restoring it onto taken identifiers is refused');

-- pre-flight lookup is authorized
SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000100","role":"authenticated"}', true); -- admin_B
SELECT pg_temp.assert_sqlstate($$SELECT public.fn_existing_student_identity_keys('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001', ARRAY['9811111111'], ARRAY[]::text[])$$, '42501', 'other tenant cannot probe existing students');
SELECT pg_temp.assert_sqlstate($$SELECT public.fn_student_identity_taken('11111111-1111-1111-1111-111111111111','9811111111','')$$, '42501', 'public pre-check function is service-role only');
RESET ROLE;

ROLLBACK;
