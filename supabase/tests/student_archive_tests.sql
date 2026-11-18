-- =============================================================================
-- Student archive + guarded permanent delete assertions
-- (migration 20261105090000_student_archive_and_permanent_delete.sql)
--
-- Same harness as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/student_archive_tests.sql
--
-- Seed facts relied on: admin_A = ...0010, warden_a1 = ...0011, admin_B (other
-- tenant) = ...0100; seed student ...110001 has an ACTIVE allocation (and
-- invoices), so it is the "protected history" case. The test creates its own
-- fresh students for the clean cases.
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

BEGIN;

-- fresh fixtures (as the superuser)
INSERT INTO public.students (id, tenant_id, property_id, admission_number, full_name, status) VALUES
  ('99999999-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-ARC-1','Archive Clean','APPLICANT'),
  ('99999999-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-ARC-2','Archive Active','ACTIVE'),
  ('99999999-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-ARC-3','Archive Live','APPLICANT');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_archive_student('99999999-0000-0000-0000-0000000000a1')$sql$, '42501', 'Warden cannot archive');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_archive_student('99999999-0000-0000-0000-0000000000a1')$sql$, '42501', 'other tenant admin cannot archive');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_archive_student('99999999-0000-0000-0000-0000000000a2')$sql$, '55000', 'ACTIVE student cannot be archived');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_archive_student('11111111-1111-1111-1111-111111110001')$sql$, '55000', 'seed student with an ACTIVE allocation cannot be archived');

SELECT public.fn_archive_student('99999999-0000-0000-0000-0000000000a1');
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE id = '99999999-0000-0000-0000-0000000000a1' AND deleted_at IS NOT NULL), 1, 'archived (soft-deleted), row kept');

-- permanent delete guards
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_permanently_delete_student('99999999-0000-0000-0000-0000000000a3')$sql$, '55000', 'a non-archived student cannot be permanently deleted');
RESET ROLE;
UPDATE public.students SET deleted_at = now() WHERE id = '11111111-1111-1111-1111-111111110001';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_permanently_delete_student('11111111-1111-1111-1111-111111110001')$sql$, '55000', 'archived student with allocations/invoices/payments is blocked');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE id = '11111111-1111-1111-1111-111111110001'), 1, 'blocked student still exists');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_permanently_delete_student('99999999-0000-0000-0000-0000000000a1')$sql$, '42501', 'Warden cannot permanently delete');
RESET ROLE;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_permanently_delete_student('99999999-0000-0000-0000-0000000000a1')$sql$, '42501', 'other tenant admin cannot permanently delete');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT public.fn_permanently_delete_student('99999999-0000-0000-0000-0000000000a1');
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE id = '99999999-0000-0000-0000-0000000000a1'), 0, 'clean archived student permanently deleted');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.audit_logs WHERE action = 'STUDENT_PERMANENTLY_DELETED' AND entity_id = '99999999-0000-0000-0000-0000000000a1'), 1, 'audit entry recorded');

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_student_dependency_report('11111111-1111-1111-1111-111111110001')$sql$, '42501', 'internal dependency report is not callable by clients');
RESET ROLE;

ROLLBACK;
