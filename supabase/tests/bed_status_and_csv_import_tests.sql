-- =============================================================================
-- Bed status management + atomic per-row CSV structure import assertions
-- (migrations 20261103090000_bed_status_management_and_csv_row_import.sql and
-- 20261104090000_structure_room_creation_and_block_code_import.sql)
--
-- Same harness as rls_tests.sql / block_uniqueness_tests.sql. One transaction,
-- ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/bed_status_and_csv_import_tests.sql
--
-- Seed facts relied on: seed beds keep status VACANT even where an ACTIVE
-- allocation exists (e001..e006 have ACTIVE allocations, e008 NOTICE_GIVEN,
-- e007 only a CLOSED one), so the allocation check — not beds.status — is what
-- protects them. Warden 11 = Block A, default permissions; Warden 12 = Block B;
-- Accountant 13; Admin 10.
--
-- NOT covered here: two sessions racing (blocking a bed while an allocation is
-- inserted). That needs two concurrent connections; the design (row lock in
-- fn_set_bed_status / tuple lock in the trigger vs FOR SHARE in
-- fn_guard_allocation_bed) is documented in the migration header.
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

CREATE OR REPLACE FUNCTION pg_temp.assert_text(_actual text, _expected text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  ELSE
    RAISE NOTICE 'OK  [%] = %', _label, _actual;
  END IF;
END $$;

-- Succeeds only if the statement fails with the given SQLSTATE
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

CREATE OR REPLACE FUNCTION pg_temp.set_status(_bed uuid, _status text, _reason text DEFAULT NULL, _until date DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  SELECT public.fn_set_bed_status(_bed, _status, _reason, _until);
$$;

CREATE OR REPLACE FUNCTION pg_temp.bed_status(_bed uuid) RETURNS text
LANGUAGE sql AS $$ SELECT status FROM public.beds WHERE id = _bed $$;

-- Row import as the CURRENT role: (block, floor, room_number, type, capacity[, block code])
CREATE OR REPLACE FUNCTION pg_temp.import_row(_block text, _floor text, _room text, _type text, _cap int, _code text DEFAULT '')
RETURNS jsonb LANGUAGE sql AS $
  SELECT public.fn_import_structure_row('11111111-1111-1111-1111-11111111a001', _block, _code, _floor, NULL, _room, _type, _cap, NULL);
$;

\set bed_active   '11111111-1111-1111-1111-11111111e001'   -- Block A, ACTIVE allocation
\set bed_free     '11111111-1111-1111-1111-11111111e007'   -- Block A, only a CLOSED allocation
\set bed_blockb   '11111111-1111-1111-1111-11111111e008'   -- Block B, NOTICE_GIVEN allocation

BEGIN;

-- ---------------------------------------------------------------------------
-- Admin: VACANT <-> MAINTENANCE / BLOCKED
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A

SELECT pg_temp.set_status(:'bed_free', 'MAINTENANCE', 'Broken cot', current_date + 5);
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'MAINTENANCE', 'Admin: VACANT -> MAINTENANCE');
SELECT pg_temp.assert_text((SELECT notes FROM public.beds WHERE id = :'bed_free'), 'Broken cot', 'reason stored');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.beds WHERE id = :'bed_free' AND maintenance_until IS NOT NULL), 1, 'completion date stored');

SELECT pg_temp.set_status(:'bed_free', 'VACANT');
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'VACANT', 'Admin: MAINTENANCE -> VACANT');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.beds WHERE id = :'bed_free' AND notes IS NULL AND maintenance_until IS NULL), 1,
  'reason + date cleared when returned to vacant');

SELECT pg_temp.set_status(:'bed_free', 'BLOCKED', 'Reserved');
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'BLOCKED', 'Admin: VACANT -> BLOCKED (no date needed)');
SELECT pg_temp.set_status(:'bed_free', 'VACANT');

-- validation
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','BLOCKED')$sql$, '23514', 'BLOCKED requires a reason');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','MAINTENANCE','x')$sql$, '23514', 'MAINTENANCE requires a completion date');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','MAINTENANCE','x', current_date - 3)$sql$, '23514', 'completion date cannot be in the past');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','OCCUPIED')$sql$, '22023', 'OCCUPIED cannot be set manually');

-- ---------------------------------------------------------------------------
-- Allocation protection (RPC and direct UPDATE)
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e001','BLOCKED','x')$sql$, '55000',
  'bed with an ACTIVE allocation cannot be BLOCKED');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e001','MAINTENANCE','x', current_date + 2)$sql$, '55000',
  'bed with an ACTIVE allocation cannot be MAINTENANCE');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e008','BLOCKED','x')$sql$, '55000',
  'bed with a NOTICE_GIVEN allocation cannot be BLOCKED');
SELECT pg_temp.assert_sqlstate($sql$UPDATE public.beds SET status = 'BLOCKED', notes = 'x' WHERE id = '11111111-1111-1111-1111-11111111e001'$sql$, '55000',
  'direct UPDATE cannot bypass the active-allocation rule');
SELECT pg_temp.assert_sqlstate($sql$UPDATE public.beds SET status = 'BLOCKED' WHERE id = '11111111-1111-1111-1111-11111111e007'$sql$, '23514',
  'direct UPDATE cannot skip the reason');

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden_a1, DEFAULT permissions (no rooms_beds_edit)
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','BLOCKED','x')$sql$, '42501',
  'Warden without rooms_beds_edit is denied');
UPDATE public.beds SET status = 'BLOCKED', notes = 'x' WHERE id = :'bed_free';
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'VACANT', 'Warden direct UPDATE changes nothing (RLS)');

RESET ROLE;
UPDATE public.role_assignments SET permissions = '{"rooms_beds_edit": true}'::jsonb
 WHERE user_id = '00000000-0000-0000-0000-000000000011' AND role = 'WARDEN';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011');
SELECT pg_temp.set_status(:'bed_free', 'BLOCKED', 'Pest control');
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'BLOCKED', 'Warden WITH rooms_beds_edit can block a bed in own block');
SELECT pg_temp.set_status(:'bed_free', 'VACANT');
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'VACANT', '... and return it to vacant');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e001','BLOCKED','x')$sql$, '55000',
  'authorized Warden still cannot block a bed with an active allocation');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e008','BLOCKED','x')$sql$, '42501',
  'authorized Warden denied on another block');

RESET ROLE;
UPDATE public.role_assignments SET permissions = '{"rooms_beds_edit": true}'::jsonb
 WHERE user_id = '00000000-0000-0000-0000-000000000013' AND role = 'ACCOUNTANT';
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000013'); -- accountant
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','BLOCKED','x')$sql$, '42501',
  'Accountant (even with the key) is denied');

RESET ROLE;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B, other tenant
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','BLOCKED','x')$sql$, '42501',
  'another tenant''s admin cannot change the bed');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Restricted beds cannot receive allocations; existing flow resumes after VACANT
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A
SELECT pg_temp.set_status(:'bed_free', 'MAINTENANCE', 'Repainting', current_date + 3);
RESET ROLE;
SELECT pg_temp.assert_sqlstate($sql$
  INSERT INTO public.allocations (tenant_id, property_id, student_id, bed_id, room_id, floor_id, block_id, fee_plan_id, status, start_date, rent_snapshot_paise, deposit_snapshot_paise, billing_cycle_day)
  VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-111111110008','11111111-1111-1111-1111-11111111e007','11111111-1111-1111-1111-11111111c003','11111111-1111-1111-1111-11111111f002','11111111-1111-1111-1111-11111111b001','11111111-1111-1111-1111-11111111fa01','PENDING_AGREEMENT', current_date, 600000, 1500000, 5)
$sql$, '55000', 'allocation on a MAINTENANCE bed is rejected');
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.set_status(:'bed_free', 'VACANT');
RESET ROLE;
INSERT INTO public.allocations (id, tenant_id, property_id, student_id, bed_id, room_id, floor_id, block_id, fee_plan_id, status, start_date, rent_snapshot_paise, deposit_snapshot_paise, billing_cycle_day)
VALUES ('11111111-1111-1111-1111-1111111100d1','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','11111111-1111-1111-1111-111111110008','11111111-1111-1111-1111-11111111e007','11111111-1111-1111-1111-11111111c003','11111111-1111-1111-1111-11111111f002','11111111-1111-1111-1111-11111111b001','11111111-1111-1111-1111-11111111fa01','PENDING_AGREEMENT', current_date, 600000, 1500000, 5);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.allocations WHERE id = '11111111-1111-1111-1111-1111111100d1'), 1,
  'after returning to VACANT the bed can be allocated');
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.set_status('11111111-1111-1111-1111-11111111e007','BLOCKED','x')$sql$, '55000',
  'and now (pending allocation) it cannot be blocked');
RESET ROLE;

-- existing automation: allocation ACTIVE + bed VACANT -> OCCUPIED and back are not intercepted
UPDATE public.beds SET status = 'OCCUPIED' WHERE id = :'bed_free';
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'OCCUPIED', 'automation VACANT -> OCCUPIED unaffected');
UPDATE public.beds SET status = 'VACANT' WHERE id = :'bed_free';
SELECT pg_temp.assert_text(pg_temp.bed_status(:'bed_free'), 'VACANT', 'automation OCCUPIED -> VACANT unaffected');
SELECT pg_temp.assert_sqlstate($sql$UPDATE public.beds SET status = 'MAINTENANCE', notes = 'x', maintenance_until = now() + interval '2 days' WHERE id = '11111111-1111-1111-1111-11111111e007'$sql$, '55000',
  'bed with a pending allocation cannot go to MAINTENANCE even via service-role UPDATE');

-- ---------------------------------------------------------------------------
-- CSV: one row = one transaction
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A

SELECT pg_temp.assert_eq(((pg_temp.import_row('Import Wing, North', 'Ground', 'IMP-1', 'DOUBLE', 2))->>'beds')::bigint, 2,
  'row creates block (name with comma) + floor + room + 2 beds');
SELECT pg_temp.assert_eq(((pg_temp.import_row('  import wing,  north ', 'Ground', 'IMP-2', 'SINGLE', 1))->>'beds')::bigint, 1,
  'next row reuses the block (case/whitespace-insensitive) and floor');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE property_id = '11111111-1111-1111-1111-11111111a001' AND lower(name) LIKE 'import wing%'), 1,
  'no duplicate block');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.floors f JOIN public.blocks b ON b.id = f.block_id WHERE lower(b.name) LIKE 'import wing%'), 1,
  'no duplicate floor');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.beds b JOIN public.rooms r ON r.id = b.room_id WHERE r.room_number IN ('IMP-1','IMP-2')), 3,
  'bed counts follow capacity');

-- failure after the block + floor were created in that same call: all rolled back
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Rollback Block', 'Rollback Floor', 'A-101', 'DOUBLE', 2)$sql$, '23505',
  'duplicate room number fails with a clear error');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE name = 'Rollback Block'), 0, 'failed row left no block');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.floors WHERE name = 'Rollback Floor'), 0, 'failed row left no floor');

-- a failed row that REUSES blocks/floors from a previous row must not touch them
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Import Wing, North', 'Ground', 'IMP-1', 'DOUBLE', 2)$sql$, '23505',
  'row reusing a shared block/floor fails on its duplicate room');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.rooms WHERE room_number = 'IMP-1'), 1, 'earlier row''s room intact');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.beds b JOIN public.rooms r ON r.id = b.room_id WHERE r.room_number = 'IMP-1'), 2, 'earlier row''s beds intact');
SELECT pg_temp.assert_eq(((pg_temp.import_row('Import Wing, North', 'Ground', 'IMP-3', 'TRIPLE', 3))->>'beds')::bigint, 3,
  'a later valid row still imports');

-- capacity / type validation
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Bad Blk', 'G', 'BAD-1', 'DOUBLE', 3)$sql$, '23514', 'DOUBLE with capacity 3 rejected');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Bad Blk', 'G', 'BAD-2', 'DORM', NULL)$sql$, '23514', 'DORM without capacity rejected');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE name = 'Bad Blk'), 0, 'rejected rows created nothing');

-- block code rules (migration 20261104090000)
SELECT pg_temp.assert_eq(((pg_temp.import_row('Coded Wing', 'G', 'CODE-1', 'SINGLE', 1, 'cw1'))->>'beds')::bigint, 1, 'new block created with its optional code');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Other Wing', 'G', 'CODE-2', 'SINGLE', 1, 'CW1')$sql$, '23505', 'same code (case-insensitive) on another new block rejected');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE name = 'Other Wing'), 0, 'rejected row left no block');
SELECT pg_temp.assert_eq(((pg_temp.import_row(' CODED   wing ', 'G', 'CODE-3', 'SINGLE', 1, 'CW1'))->>'beds')::bigint, 1, 'existing block reused with the same code');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Coded Wing', 'G', 'CODE-4', 'SINGLE', 1, 'ZZ')$sql$, '23505', 'existing block with a different code rejected');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('', 'G', 'CODE-5', 'SINGLE', 1, 'Q')$sql$, '23514', 'block code without a block name rejected');

-- manual Add Room (fn_create_room_with_beds) == one CSV row
SELECT pg_temp.assert_eq(((public.fn_create_room_with_beds((SELECT id FROM public.floors WHERE name = 'Ground' AND block_id IN (SELECT id FROM public.blocks WHERE name = 'Coded Wing')), 'MAN-1', 'TRIPLE', 3, 600000))->>'beds')::bigint, 3, 'manual room creates capacity beds');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_create_room_with_beds((SELECT id FROM public.floors WHERE name = 'Ground' AND block_id IN (SELECT id FROM public.blocks WHERE name = 'Coded Wing')), 'MAN-1', 'SINGLE', 1, NULL)$sql$, '23505', 'manual duplicate room number rejected');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_create_room_with_beds((SELECT id FROM public.floors WHERE name = 'Ground' AND block_id IN (SELECT id FROM public.blocks WHERE name = 'Coded Wing')), 'MAN-2', 'DOUBLE', 3, NULL)$sql$, '23514', 'manual DOUBLE with capacity 3 rejected');
SELECT pg_temp.assert_sqlstate($sql$SELECT public.fn_create_room_with_beds((SELECT id FROM public.floors WHERE name = 'Ground' AND block_id IN (SELECT id FROM public.blocks WHERE name = 'Coded Wing')), 'MAN-3', 'DORM', NULL, NULL)$sql$, '23514', 'manual DORM without capacity rejected');

-- authorization (SECURITY INVOKER: caller's RLS applies)
RESET ROLE;
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- student
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('Student Blk', 'G', 'ST-1', 'SINGLE', 1)$sql$, '42501',
  'a student cannot import structure');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B (other tenant)
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.import_row('X Blk', 'G', 'X-1', 'SINGLE', 1)$sql$, '42501',
  'another tenant''s admin cannot import into this property');
RESET ROLE;

ROLLBACK;
