-- =============================================================================
-- Complaint reopening: student 48h reopen + the permissioned, audited Admin override
-- (migration 20261120090000_complaint_reopen_admin_override.sql)
--
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/complaint_reopen_override_tests.sql
--
-- Seed users used: 00..10 admin_A (granted the override below), 00..14 admin_B (never granted),
-- 00..11 warden, 00..22 student 03 (owns the fixture complaints).
-- NOTE: NOT executed against a real Supabase stack. The same scenarios (94 checks) were run against a
-- real PostgreSQL 18 with production functions loaded from the migration files; see docs/MEMORY.md.
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

-- fixture: a complaint of student 03 in a given status / window
CREATE OR REPLACE FUNCTION pg_temp.mk(_id uuid, _status text, _reopen_in interval) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.complaints (id, tenant_id, property_id, student_id, title, description, status,
                                 reopen_until, resolved_at, closed_at, resolution_summary, sla_due_at)
  SELECT _id, s.tenant_id, s.property_id, s.id, 'T', 'test complaint', _status,
         now() + _reopen_in,
         CASE WHEN _status IN ('RESOLVED','CLOSED') THEN now() - interval '1 hour' END,
         CASE WHEN _status = 'CLOSED' THEN now() END,
         CASE WHEN _status IN ('RESOLVED','CLOSED') THEN 'Pipe replaced.' END,
         now() + interval '1 day'
    FROM public.students s WHERE s.profile_id = '00000000-0000-0000-0000-000000000022';
$$;

SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b1', 'RESOLVED', interval '20 hours');   -- in window
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b2', 'RESOLVED', interval '-5 hours');   -- window expired
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b3', 'CLOSED',   interval '-5 hours');
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b4', 'CANCELLED', interval '20 hours');
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b5', 'RESOLVED', interval '20 hours');   -- student reopens
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b6', 'IN_PROGRESS', interval '0 hours');
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000b7', 'RESOLVED', interval '-1 hour');    -- student, expired

-- Grant the permission the supported way: a trusted backend (no end-user session). admin_B never gets it.
UPDATE public.role_assignments
   SET permissions = permissions || '{"complaint_reopen_override": true}'::jsonb
 WHERE user_id = '00000000-0000-0000-0000-000000000010' AND role = 'HOSTEL_ADMIN';

-- 1. Admin WITHOUT the permission (admin_B): no regular reopen, no override
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000014');
SELECT pg_temp.assert_text(public.can_override_reopen_complaint(
  (SELECT tenant_id FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b1'),
  (SELECT property_id FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b1'))::text,
  'false', 'admin without the permission: can_override_reopen_complaint is false (button hidden)');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b1'$$,
  'admin: direct reopen inside the window');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b3'$$,
  'admin: direct reopen of CLOSED');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b1', 'A perfectly good reason')$$,
  'admin without the permission: override function refused');
RESET ROLE;

-- 2. Warden: no direct reopen, no override
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000011');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b1'$$,
  'warden: direct reopen');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b1', 'A perfectly good reason')$$,
  'warden: override function refused');
RESET ROLE;

-- 3. Authorised admin (admin_A)
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_text(public.can_override_reopen_complaint(
  (SELECT tenant_id FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b1'),
  (SELECT property_id FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b1'))::text,
  'true', 'authorised admin: can_override_reopen_complaint is true');
-- mandatory reason, enforced in the database
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b2', NULL)$$, 'reason NULL');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b2', '        ')$$, 'reason blank');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b2', 'too short')$$, 'reason 9 characters');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b2'$$,
  'authorised admin: direct UPDATE is still rejected (only the audited function may reopen)');
-- RESOLVED with an expired window, and CLOSED
SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b2', 'Parent reported the leak is back.');
SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b3', 'Closed too early, issue persists.');
-- CANCELLED and non-eligible statuses never reopen, override included
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b4', 'Trying to reopen a cancelled one')$$, 'override on CANCELLED');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b4'$$, 'direct reopen of CANCELLED');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b6', 'Not resolved yet, nothing to reopen')$$, 'override on IN_PROGRESS');
RESET ROLE;

SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b2'), 'REOPENED', 'override: RESOLVED (expired window) -> REOPENED');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b3'), 'REOPENED', 'override: CLOSED -> REOPENED');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b4'), 'CANCELLED', 'CANCELLED unchanged');
SELECT pg_temp.assert_text((SELECT (resolved_at IS NULL AND closed_at IS NULL AND resolution_summary = 'Pipe replaced.')::text
                              FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b3'),
  'true', 'timestamps cleared, resolution summary preserved');
-- history: who / when / why
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.audit_logs
   WHERE entity_id IN ('88888888-0000-0000-0000-0000000000b2', '88888888-0000-0000-0000-0000000000b3')
     AND action = 'COMPLAINT_REOPEN_OVERRIDE'
     AND actor_user_id = '00000000-0000-0000-0000-000000000010'
     AND metadata ->> 'reason' IS NOT NULL AND metadata ->> 'reopened_at' IS NOT NULL),
  '2', 'audit_logs: admin id, reason and timestamp recorded for both overrides');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.complaint_comments
   WHERE complaint_id IN ('88888888-0000-0000-0000-0000000000b2', '88888888-0000-0000-0000-0000000000b3')
     AND author_user_id = '00000000-0000-0000-0000-000000000010'
     AND body LIKE 'Reopened by Admin override. Reason: %'),
  '2', 'complaint history: override comment authored by the admin');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.audit_logs
   WHERE action = 'COMPLAINT_REOPEN_OVERRIDE'
     AND entity_id IN ('88888888-0000-0000-0000-0000000000b1', '88888888-0000-0000-0000-0000000000b4', '88888888-0000-0000-0000-0000000000b6')),
  '0', 'refused attempts left no audit record');

-- 4. Student: normal reopen inside 48h works (and is not an override); expired / CLOSED / CANCELLED do not
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000022');
UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b5';
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b7'$$, 'student: reopen after the window expired');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b4'$$, 'student: reopen of CANCELLED');
SELECT pg_temp.assert_fails($$SELECT public.fn_admin_reopen_complaint('88888888-0000-0000-0000-0000000000b7', 'I am a student, let me in')$$, 'student: override function refused');
RESET ROLE;
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '88888888-0000-0000-0000-0000000000b5'), 'REOPENED', 'student reopened inside the window');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.audit_logs WHERE entity_id = '88888888-0000-0000-0000-0000000000b5' AND action = 'COMPLAINT_REOPEN_OVERRIDE'),
  '0', 'a student reopen is not recorded as an override');

-- 5. No end-user session (service role / direct SQL) cannot reopen either
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '88888888-0000-0000-0000-0000000000b7'$$, 'no session: direct reopen');

-- 6. The permission cannot be self-granted by an admin; anon cannot run the function
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000014');
DO $$
BEGIN
  BEGIN
    UPDATE public.role_assignments
       SET permissions = permissions || '{"complaint_reopen_override": true}'::jsonb
     WHERE user_id = '00000000-0000-0000-0000-000000000014';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  [self-grant] rejected (%): %', SQLSTATE, SQLERRM;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.role_assignments
   WHERE user_id = '00000000-0000-0000-0000-000000000014' AND permissions ->> 'complaint_reopen_override' = 'true'),
  '0', 'admin_B did not obtain the permission');
SELECT pg_temp.assert_text(has_function_privilege('anon', 'public.fn_admin_reopen_complaint(uuid, text)', 'EXECUTE')::text, 'false', 'anon cannot execute the override function');

ROLLBACK;
