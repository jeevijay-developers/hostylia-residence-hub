-- =============================================================================
-- Complaint status transitions + automatic RESOLVED -> CLOSED
-- (migration 20261111090000_complaint_status_transitions_and_auto_close.sql)
--
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/complaint_status_workflow_tests.sql
--
-- NOTE: NOT executed against a real Postgres. The same scenarios (full 56-pair transition matrix,
-- window edge cases, job idempotency, privileges) were run in-process on PGlite; see docs/MEMORY.md.
-- Rows are inserted straight into complaints as the superuser (INSERT is not guarded), so the
-- fixtures need no seed-specific student/category ids beyond the first ones found below.
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

BEGIN;

-- fixture helper: a complaint in a given status with a given reopen_until
CREATE OR REPLACE FUNCTION pg_temp.mk(_id uuid, _status text, _reopen_until timestamptz) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.complaints (id, tenant_id, property_id, student_id, category_id, title, description,
                                 status, reopen_until, resolved_at, sla_due_at)
  SELECT _id, s.tenant_id, s.property_id, s.id,
         (SELECT id FROM public.complaint_categories WHERE property_id = s.property_id LIMIT 1),
         'T', 'test complaint', _status, _reopen_until,
         CASE WHEN _status IN ('RESOLVED','CLOSED') THEN now() - interval '1 day' END, now() + interval '1 day'
    FROM public.students s ORDER BY s.created_at LIMIT 1;
$$;

SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a1', 'ASSIGNED', NULL);
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a2', 'RESOLVED', now() + interval '6 hours');
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a3', 'RESOLVED', now() - interval '1 hour');
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a4', 'CLOSED',   now() + interval '6 hours');
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a5', 'OPEN',     NULL);

-- 1. Start Working
UPDATE public.complaints SET status = 'IN_PROGRESS' WHERE id = '77777777-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a1'),
  'IN_PROGRESS', 'ASSIGNED -> IN_PROGRESS (Start Working)');

-- 2. invalid transitions are rejected
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'CLOSED' WHERE id = '77777777-0000-0000-0000-0000000000a5'$$, 'OPEN -> CLOSED');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'OPEN' WHERE id = '77777777-0000-0000-0000-0000000000a1'$$, 'IN_PROGRESS -> OPEN');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'WAITING_FOR_STUDENT' WHERE id = '77777777-0000-0000-0000-0000000000a5'$$, 'nothing enters WAITING_FOR_STUDENT');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'CANCELLED' WHERE id = '77777777-0000-0000-0000-0000000000a5'$$, 'nothing enters CANCELLED');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '77777777-0000-0000-0000-0000000000a4'$$, 'CLOSED cannot be reopened');
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '77777777-0000-0000-0000-0000000000a3'$$, 'reopen after the 48h window');

-- 3. reopening is the student's (inside the window) or the audited Admin override's: a session with
--    no student behind it (this superuser session = service role / direct SQL) is rejected, even inside
--    the window. The student and override paths are covered in complaint_reopen_override_tests.sql.
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'REOPENED' WHERE id = '77777777-0000-0000-0000-0000000000a2'$$,
  'RESOLVED -> REOPENED without a student or an override');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a2'),
  'RESOLVED', 'the complaint stays RESOLVED');

-- 4. an end-user session cannot close, even after the window
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a6', 'RESOLVED', now() - interval '1 hour');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true); -- admin_A
SELECT pg_temp.assert_fails($$UPDATE public.complaints SET status = 'CLOSED' WHERE id = '77777777-0000-0000-0000-0000000000a6'$$,
  'a staff session cannot close manually');
RESET ROLE;

-- 5. the job closes only RESOLVED complaints whose window has elapsed (a3, a6), and is idempotent
SELECT pg_temp.mk('77777777-0000-0000-0000-0000000000a7', 'RESOLVED', now() + interval '6 hours');
SELECT set_config('request.jwt.claims', '', true);
SELECT public.fn_close_resolved_complaints() >= 2 AS closed_at_least_two \gset
SELECT pg_temp.assert_text(:'closed_at_least_two', 'true', 'job closed the elapsed RESOLVED complaints');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a3'), 'CLOSED', 'elapsed -> CLOSED');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a6'), 'CLOSED', 'elapsed -> CLOSED (2)');
SELECT pg_temp.assert_text((SELECT status FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a7'), 'RESOLVED', 'in-window RESOLVED untouched');
SELECT pg_temp.assert_text((SELECT (closed_at IS NOT NULL)::text FROM public.complaints WHERE id = '77777777-0000-0000-0000-0000000000a3'), 'true', 'closed_at set');
SELECT pg_temp.assert_text(public.fn_close_resolved_complaints()::text, '0', 'job is idempotent');

-- 6. only service_role may run the job
SELECT pg_temp.assert_text(has_function_privilege('authenticated', 'public.fn_close_resolved_complaints()', 'EXECUTE')::text, 'false', 'authenticated cannot run the job');

ROLLBACK;
