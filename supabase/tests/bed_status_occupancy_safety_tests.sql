-- =============================================================================
-- Bed status & active-allocation safety
-- (migration 20261116090000_bed_status_occupancy_safety.sql, on top of 20261103090000)
--
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/bed_status_occupancy_safety_tests.sql
--
-- NOTE: NOT executed with the Supabase CLI. The same scenarios (plus two-session race tests) were run
-- on a real PostgreSQL 18 with the production functions extracted from these migrations; see
-- docs/MEMORY.md. Two-session races cannot be expressed in one psql transaction and are not in this file.
-- Fixtures are picked from the seed: a bed that has an open allocation, and a bed that has none.
-- Admin 10 = Hostel Admin, Accountant 13 (see rls_tests.sql).
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

CREATE OR REPLACE FUNCTION pg_temp.assert_fails(_sql text, _label text, _like text DEFAULT '%') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE _like THEN
      RAISE NOTICE 'OK  [%] rejected (%): %', _label, SQLSTATE, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'ASSERT FAIL [%]: failed with an unexpected message: %', _label, SQLERRM;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: statement succeeded but should have failed', _label;
END $$;

BEGIN;

-- fixtures
CREATE TEMP TABLE fx AS
SELECT
  (SELECT b.id FROM public.beds b JOIN public.allocations a ON a.bed_id = b.id
    WHERE a.deleted_at IS NULL AND a.status IN ('ACTIVE','NOTICE_GIVEN') AND b.deleted_at IS NULL LIMIT 1) AS allocated_bed,
  (SELECT b.id FROM public.beds b
    WHERE b.status = 'VACANT' AND b.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.allocations a WHERE a.bed_id = b.id AND a.deleted_at IS NULL
                        AND a.status IN ('PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION')) LIMIT 1) AS free_bed;

-- 1. an active allocation blocks MAINTENANCE / BLOCKED (direct UPDATE and RPC, any caller)
SELECT pg_temp.assert_fails(format($$UPDATE public.beds SET status='MAINTENANCE', notes='x', maintenance_until=now()+interval '3 days' WHERE id=%L$$, (SELECT allocated_bed FROM fx)),
  'MAINTENANCE on a bed with an active allocation (superuser)', '%allocation%');
SELECT pg_temp.assert_fails(format($$UPDATE public.beds SET status='BLOCKED', notes='x' WHERE id=%L$$, (SELECT allocated_bed FROM fx)),
  'BLOCKED on a bed with an active allocation (superuser)', '%allocation%');

-- 2. OCCUPIED is never manual
SELECT pg_temp.assert_fails(format($$UPDATE public.beds SET status='OCCUPIED' WHERE id=%L$$, (SELECT free_bed FROM fx)),
  'manual VACANT -> OCCUPIED with no allocation', '%OCCUPIED%');
SELECT pg_temp.assert_fails($$INSERT INTO public.beds (tenant_id, property_id, block_id, floor_id, room_id, code, status)
   SELECT tenant_id, property_id, block_id, floor_id, room_id, 'ZZ-OCC', 'OCCUPIED' FROM public.beds LIMIT 1$$,
  'a bed cannot be inserted as OCCUPIED', '%cannot be created as OCCUPIED%');
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true); -- admin_A
SELECT pg_temp.assert_fails(format($$SELECT public.fn_set_bed_status(%L,'OCCUPIED',NULL,NULL)$$, (SELECT free_bed FROM fx)),
  'RPC refuses OCCUPIED', '%OCCUPIED%');
SELECT pg_temp.assert_fails(format($$UPDATE public.beds SET status='VACANT' WHERE id=%L$$, (SELECT allocated_bed FROM fx)),
  'manual OCCUPIED/VACANT flip of an allocated bed is not possible', '%');

-- 3. unauthorized caller (accountant) cannot change bed status
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated"}', true); -- accountant
SELECT pg_temp.assert_fails(format($$SELECT public.fn_set_bed_status(%L,'MAINTENANCE','x',current_date + 3)$$, (SELECT free_bed FROM fx)),
  'accountant cannot mark a bed MAINTENANCE', '%Not authorized%');
RESET ROLE;

-- 4. a free bed can still be taken through MAINTENANCE and back by an authorized admin
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true);
SELECT public.fn_set_bed_status((SELECT free_bed FROM fx), 'MAINTENANCE', 'Leak repair', current_date + 3);
SELECT pg_temp.assert_text((SELECT status FROM public.beds WHERE id = (SELECT free_bed FROM fx)), 'MAINTENANCE', 'free bed -> MAINTENANCE');
SELECT public.fn_set_bed_status((SELECT free_bed FROM fx), 'VACANT', NULL, NULL);
SELECT pg_temp.assert_text((SELECT status FROM public.beds WHERE id = (SELECT free_bed FROM fx)), 'VACANT', 'MAINTENANCE -> VACANT');
RESET ROLE;

ROLLBACK;
