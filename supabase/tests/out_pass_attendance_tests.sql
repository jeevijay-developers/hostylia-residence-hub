-- =============================================================================
-- Out-Pass attendance + overdue-return detection assertions
-- (migration 20261108090000_out_pass_attendance_and_overdue_detection.sql)
--
-- Same harness as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/out_pass_attendance_tests.sql
--
-- Seed facts relied on: admin_A = ...0010, admin_B (other tenant) = ...0100,
-- property A1 = ...a001 (Asia/Kolkata), seed student ...110001 has an ACTIVE
-- allocation in Block A. The test creates its own gate passes and events.
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

BEGIN;

-- fixtures (superuser): one pending pass, one approved-unused, one out (not overdue),
-- one out + overdue, one returned
INSERT INTO public.gate_passes (id, tenant_id, property_id, block_id, student_id, pass_number, reason, out_at, expected_in_at, status)
SELECT g.id, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-11111111a001',
       '11111111-1111-1111-1111-11111111b001', s.id, g.num, 'test', g.out_at, g.exp_at, g.status
  FROM (VALUES
    ('99999999-0000-0000-0000-0000000000c1'::uuid, 'T-PEND', now() - interval '1 hour', now() + interval '5 hours', 'PENDING_WARDEN'),
    ('99999999-0000-0000-0000-0000000000c2'::uuid, 'T-APPR', now() + interval '1 hour', now() + interval '6 hours', 'APPROVED'),
    ('99999999-0000-0000-0000-0000000000c3'::uuid, 'T-OUT',  now() - interval '2 hours', now() + interval '4 hours', 'ACTIVE'),
    ('99999999-0000-0000-0000-0000000000c4'::uuid, 'T-LATE', now() - interval '6 hours', now() - interval '2 hours', 'ACTIVE'),
    ('99999999-0000-0000-0000-0000000000c5'::uuid, 'T-BACK', now() - interval '6 hours', now() - interval '2 hours', 'COMPLETED')
  ) g(id, num, out_at, exp_at, status)
  CROSS JOIN LATERAL (SELECT id FROM public.students WHERE admission_number IS NOT NULL ORDER BY created_at LIMIT 1) s;

INSERT INTO public.gate_events (tenant_id, property_id, block_id, student_id, gate_pass_id, direction, event_at, recorded_by, idempotency_key)
SELECT gp.tenant_id, gp.property_id, gp.block_id, gp.student_id, gp.id, e.dir, e.at,
       '00000000-0000-0000-0000-000000000010', 'T-' || gp.pass_number || '-' || e.dir
  FROM public.gate_passes gp
  JOIN (VALUES ('T-OUT','OUT', now() - interval '2 hours'), ('T-LATE','OUT', now() - interval '6 hours'),
               ('T-BACK','OUT', now() - interval '6 hours'), ('T-BACK','IN', now() - interval '3 hours')) e(num, dir, at)
    ON e.num = gp.pass_number;

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true); -- admin_A

SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fn_gate_pass_legs('11111111-1111-1111-1111-11111111a001') WHERE pass_number LIKE 'T-%' AND in_at IS NULL), 2,
  'departed & not returned: T-OUT and T-LATE only (pending / approved-unused / returned are not)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fn_overdue_out_passes('11111111-1111-1111-1111-11111111a001') WHERE pass_number = 'T-LATE'), 1, 'T-LATE is overdue');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fn_overdue_out_passes('11111111-1111-1111-1111-11111111a001') WHERE pass_number = 'T-OUT'), 0, 'T-OUT is not overdue yet');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fn_overdue_out_passes('11111111-1111-1111-1111-11111111a001') WHERE pass_number = 'T-BACK'), 0, 'a returned pass is never overdue');

-- permissions
SELECT pg_temp.assert_sqlstate($$SELECT public.fn_scan_overdue_gate_passes()$$, '42501', 'authenticated users cannot run the scan');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000100","role":"authenticated"}', true); -- admin_B
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.fn_overdue_out_passes('11111111-1111-1111-1111-11111111a001')), 0, 'another tenant sees no overdue passes');
RESET ROLE;

-- scan: idempotent alerts, resolved on return, EXPIRED only for never-used passes
SELECT public.fn_scan_overdue_gate_passes();
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications WHERE event_type = 'GATE_PASS_OVERDUE' AND payload ->> 'pass_number' = 'T-LATE'), (SELECT count(DISTINCT recipient_user_id) FROM public.notifications WHERE event_type = 'GATE_PASS_OVERDUE' AND payload ->> 'pass_number' = 'T-LATE'), 'one alert per recipient');
CREATE TEMP TABLE _n1 AS SELECT count(*) AS c FROM public.notifications WHERE event_type = 'GATE_PASS_OVERDUE';
SELECT public.fn_scan_overdue_gate_passes();
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications WHERE event_type = 'GATE_PASS_OVERDUE'), (SELECT c FROM _n1), 'second scan creates no duplicate alerts');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.gate_passes WHERE id = '99999999-0000-0000-0000-0000000000c4' AND status = 'ACTIVE'), 1, 'a departed overdue pass stays ACTIVE (the return scan still works)');

INSERT INTO public.gate_events (tenant_id, property_id, block_id, student_id, gate_pass_id, direction, event_at, recorded_by, idempotency_key)
SELECT tenant_id, property_id, block_id, student_id, id, 'IN', now(), '00000000-0000-0000-0000-000000000010', 'T-LATE-IN' FROM public.gate_passes WHERE id = '99999999-0000-0000-0000-0000000000c4';
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.notifications WHERE event_type = 'GATE_PASS_OVERDUE' AND payload ->> 'pass_number' = 'T-LATE' AND read_at IS NULL), 0, 'an actual return clears (resolves) the alerts');

ROLLBACK;
