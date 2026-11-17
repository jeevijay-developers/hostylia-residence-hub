-- =============================================================================
-- Notice custom audience: notice_recipients RLS + validation trigger
-- (migration 20261121090000_notice_custom_audience_recipients.sql)
--
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/notice_custom_audience_tests.sql
--
-- Seed users: 00..10 admin_A (HOSTEL_ADMIN, tenant A, authors the notice), 00..14 admin_B-in-A
-- (second HOSTEL_ADMIN of tenant A, not the author), 00..100 admin of tenant B, 00..22 a student.
-- NOTE: NOT executed against a real Supabase stack. The same scenarios (39 checks, incl. the scheduled
-- publisher) ran against a real PostgreSQL 18 with production functions loaded from the migration files;
-- see docs/MEMORY.md.
-- =============================================================================

\set ON_ERROR_STOP on

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

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
END $$;

BEGIN;

-- fixtures (as the superuser): an eligible student of tenant A, one of tenant B, an ineligible one of A
CREATE TEMP TABLE fx AS
SELECT
  (SELECT s.id FROM public.students s WHERE s.tenant_id = '11111111-1111-1111-1111-111111111111'
     AND s.status IN ('ACTIVE','NOTICE_GIVEN') AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1) AS stu_a,
  (SELECT s.property_id FROM public.students s WHERE s.tenant_id = '11111111-1111-1111-1111-111111111111'
     AND s.status IN ('ACTIVE','NOTICE_GIVEN') AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1) AS prop_a,
  (SELECT s.id FROM public.students s WHERE s.tenant_id = '22222222-2222-2222-2222-222222222222'
     AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1) AS stu_b;
GRANT SELECT ON fx TO authenticated;

INSERT INTO public.students (id, tenant_id, property_id, admission_number, full_name, status)
SELECT '88888888-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', prop_a, 'NOTICE-TEST-MOVED', 'Moved Out Test', 'MOVED_OUT' FROM fx;

INSERT INTO public.notices (id, tenant_id, property_id, title, body, status, audience_type, channels, publish_at, created_by)
SELECT '88888888-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', prop_a, 'Custom notice', 'Body text',
       'SCHEDULED', 'CUSTOM', ARRAY['IN_APP'], now() + interval '1 day', '00000000-0000-0000-0000-000000000010' FROM fx;
INSERT INTO public.notices (id, tenant_id, property_id, title, body, status, audience_type, channels, publish_at, created_by)
SELECT '88888888-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-111111111111', prop_a, 'Plain notice', 'Body text',
       'SCHEDULED', 'STUDENTS', ARRAY['IN_APP'], now() + interval '1 day', '00000000-0000-0000-0000-000000000010' FROM fx;

-- 1. the author (a Hostel Admin) attaches an eligible student; no duplicates
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000010');
INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
SELECT '88888888-0000-0000-0000-0000000000f1', stu_a, '11111111-1111-1111-1111-111111111111', prop_a FROM fx;
SELECT pg_temp.assert_fails($$INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
  SELECT '88888888-0000-0000-0000-0000000000f1', stu_a, '11111111-1111-1111-1111-111111111111', prop_a FROM fx$$,
  'the same student twice (primary key)');
-- 2. validation trigger: tenant B student, moved-out student, non-custom notice
SELECT pg_temp.assert_fails($$INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
  SELECT '88888888-0000-0000-0000-0000000000f1', stu_b, '11111111-1111-1111-1111-111111111111', prop_a FROM fx$$,
  'student of another tenant');
SELECT pg_temp.assert_fails($$INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
  SELECT '88888888-0000-0000-0000-0000000000f1', '88888888-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', prop_a FROM fx$$,
  'moved-out (ineligible) student');
SELECT pg_temp.assert_fails($$INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
  SELECT '88888888-0000-0000-0000-0000000000f2', stu_a, '11111111-1111-1111-1111-111111111111', prop_a FROM fx$$,
  'recipients on a non-custom notice');
-- 3. append-only
SELECT pg_temp.assert_fails($$UPDATE public.notice_recipients SET student_id = student_id$$, 'UPDATE not allowed');
SELECT pg_temp.assert_fails($$DELETE FROM public.notice_recipients$$, 'DELETE not allowed');
RESET ROLE;

-- 4. not the author / other tenant / student: cannot insert, and cannot read
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000014');
SELECT pg_temp.assert_fails($$INSERT INTO public.notice_recipients (notice_id, student_id, tenant_id, property_id)
  SELECT '88888888-0000-0000-0000-0000000000f1', stu_a, '11111111-1111-1111-1111-111111111111', prop_a FROM fx$$,
  'another admin of the tenant who is not the author');
RESET ROLE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000100');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notice_recipients), '0', 'other tenant admin sees no recipients');
RESET ROLE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000022');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notice_recipients), '0', 'a student sees no recipients');
RESET ROLE;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notice_recipients), '1', 'the author sees the list');
RESET ROLE;

-- 5. anon has no access; recipients vanish with their notice
SELECT pg_temp.assert_text(has_table_privilege('anon', 'public.notice_recipients', 'SELECT')::text, 'false', 'anon has no privileges');
DELETE FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000f1';
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notice_recipients), '0', 'cascade on notice delete');

ROLLBACK;
