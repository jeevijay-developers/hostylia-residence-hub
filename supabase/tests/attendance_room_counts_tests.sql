-- =============================================================================
-- attendance_room_counts() assertions
-- (migration 20261102110000_attendance_room_counts_rpc.sql)
--
-- Same harness as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/attendance_room_counts_tests.sql
--
-- Seed handles (property A1 = ...a001, A2 = ...a002)
--   A1 rooms: c001 (students 01,02)  c002 (03,04)  c003 (05,06)  c004 (07, NOTICE_GIVEN)
--   A2 rooms: c101 (09,10)           c102 (11,12)  (13 is NOTICE_GIVEN)
--   student 08 is MOVED_OUT (no open allocation)
--   admin_A = ..010, warden_A_blockA = ..011, admin_B = ..100, student_01 = ..020
-- =============================================================================

\set ON_ERROR_STOP on

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

-- count of one room in the RPC result (0 when the room is absent)
CREATE OR REPLACE FUNCTION pg_temp.room_count(_property uuid, _room uuid) RETURNS bigint
LANGUAGE sql AS $$
  SELECT COALESCE((SELECT student_count FROM public.attendance_room_counts(_property) WHERE room_id = _room), 0)::bigint;
$$;

\set a1 '11111111-1111-1111-1111-11111111a001'
\set a2 '11111111-1111-1111-1111-11111111a002'
\set c001 '11111111-1111-1111-1111-11111111c001'
\set c002 '11111111-1111-1111-1111-11111111c002'
\set c003 '11111111-1111-1111-1111-11111111c003'
\set c004 '11111111-1111-1111-1111-11111111c004'
\set c101 '11111111-1111-1111-1111-11111111c101'
\set c102 '11111111-1111-1111-1111-11111111c102'

BEGIN;

-- ---------------------------------------------------------------------------
-- Function shape: INVOKER (RLS applies), not callable by anon
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_eq((SELECT (NOT prosecdef)::int FROM pg_proc WHERE proname = 'attendance_room_counts'), 1,
  'attendance_room_counts is SECURITY INVOKER');
SELECT pg_temp.assume_anon();
SELECT pg_temp.assert_throws($sql$SELECT * FROM public.attendance_room_counts('11111111-1111-1111-1111-11111111a001')$sql$,
  'anon cannot call the RPC');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Admin: ACTIVE students only, per room, distinct counts
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c001'), 2, 'A1 room c001 = 2 active students');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c002'), 2, 'A1 room c002 = 2');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c003'), 2, 'A1 room c003 = 2');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c004'), 0, 'room held only by a NOTICE_GIVEN student is not listed');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance_room_counts(:'a1')), 3, 'A1 lists exactly the 3 occupied rooms');
SELECT pg_temp.assert_eq((SELECT sum(student_count) FROM public.attendance_room_counts(:'a1')),
  (SELECT count(*) FROM public.students s WHERE s.property_id = :'a1' AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.allocations a WHERE a.student_id = s.id AND a.status = 'ACTIVE' AND a.deleted_at IS NULL)),
  'sum of room counts = eligible student total used by the attendance summary');

-- Property switch: other property's rooms only
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a2', :'c101'), 2, 'A2 room c101 = 2');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a2', :'c102'), 2, 'A2 room c102 = 2');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a2', :'c001'), 0, 'A1 room never appears under A2');

-- ---------------------------------------------------------------------------
-- Rooms drop out / counts shrink when students stop being eligible
-- ---------------------------------------------------------------------------
RESET ROLE;
UPDATE public.students SET deleted_at = now() WHERE id = '11111111-1111-1111-1111-111111110002';           -- soft-deleted
UPDATE public.students SET status = 'NOTICE_GIVEN' WHERE id = '11111111-1111-1111-1111-111111110003';       -- no longer ACTIVE
UPDATE public.allocations SET deleted_at = now() WHERE id = '11111111-1111-1111-1111-1111111100a4';        -- soft-deleted allocation
UPDATE public.rooms SET deleted_at = now() WHERE id = :'c003';                                              -- soft-deleted room
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c001'), 1, 'soft-deleted student no longer counted');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c002'), 0, 'room with no eligible student is removed from suggestions');
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c003'), 0, 'soft-deleted room is removed');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Tenant / role scope (existing RLS, nothing widened)
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B (other tenant)
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance_room_counts(:'a1')), 0, 'cross-tenant admin gets no rooms');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden Block A, default permissions
SELECT pg_temp.assert_eq(pg_temp.room_count(:'a1', :'c001'), 1, 'warden sees the room counts for their property');
RESET ROLE;

-- A Warden whose rooms_beds_view is switched off keeps students_view but must NOT
-- learn room numbers: the INVOKER function returns no rooms (and no error).
UPDATE public.role_assignments SET permissions = '{"rooms_beds_view": false}'::jsonb
 WHERE user_id = '00000000-0000-0000-0000-000000000011' AND role = 'WARDEN';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.attendance_room_counts(:'a1')), 0,
  'warden without rooms_beds_view is shown no rooms');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.students WHERE property_id = :'a1' AND status = 'ACTIVE') > 0, 1,
  'same warden still sees the student roster (All Rooms stays usable)');
RESET ROLE;

-- A student only ever sees their own row's room, never other students' counts.
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- student_01
SELECT pg_temp.assert_eq((SELECT COALESCE(sum(student_count), 0) FROM public.attendance_room_counts(:'a1')) <= 1, 1,
  'student cannot see other students through room counts');
RESET ROLE;

ROLLBACK;
