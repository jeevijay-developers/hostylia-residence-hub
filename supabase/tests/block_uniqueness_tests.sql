-- =============================================================================
-- Block Name / Block Code uniqueness assertions
-- (migration 20261102120000_block_name_code_uniqueness.sql)
--
-- Same harness as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/block_uniqueness_tests.sql
--
-- NOT covered here: the migration's own "fail safely on existing duplicates"
-- path (it runs once, before the indexes exist). To exercise it on a scratch DB,
-- apply every migration up to 20261102110000, insert two live blocks
-- ("A" and "a") in one property, then apply 20261102120000 — it must abort with
-- the duplicate report and leave the data untouched.
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

-- insert helper: (property, name, code) as the CURRENT role
CREATE OR REPLACE FUNCTION pg_temp.add_block(_property uuid, _name text, _code text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.blocks (tenant_id, property_id, name, code)
  VALUES ('11111111-1111-1111-1111-111111111111', _property, _name, _code)
  RETURNING id;
$$;

\set a1 '11111111-1111-1111-1111-11111111a001'
\set a2 '11111111-1111-1111-1111-11111111a002'

BEGIN;

-- ---------------------------------------------------------------------------
-- Names: custom + Unicode accepted; case / whitespace-insensitive duplicates refused
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000010'); -- admin_A

SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Test Tower') ) x), 1, 'custom block name accepted');
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Girls Block') ) x), 1, '"Girls Block" accepted');
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Block-1') ) x), 1, '"Block-1" accepted');
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'ब्लॉक ए') ) x), 1, 'Unicode (Devanagari) block name accepted');

SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Test Tower')$sql$, '23505', 'exact duplicate name');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'test tower')$sql$, '23505', 'case-insensitive duplicate name');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', '  TEST   Tower  ')$sql$, '23505', 'whitespace-normalized duplicate name');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', E'Test\tTower')$sql$, '23505', 'tab between words normalizes to a space');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'ब्लॉक ए')$sql$, '23505', 'Unicode duplicate refused');

-- stored form is trimmed / collapsed
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', '  Wing    East  ')) x), 1, 'padded name accepted');
SELECT pg_temp.assert_text((SELECT name FROM public.blocks WHERE property_id = :'a1' AND lower(name) LIKE 'wing%'), 'Wing East',
  'name stored trimmed with whitespace collapsed');

-- same name in another property is fine
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a2', 'Test Tower')) x), 1, 'same name allowed in a different property');

-- blank name refused
SELECT pg_temp.assert_throws($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', '   ')$sql$, 'blank block name refused');

-- ---------------------------------------------------------------------------
-- Codes: optional; blank stored as NULL; case-insensitive unique per property
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Code Block 1', 'G1')) x), 1, 'code accepted');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Code Block 2', 'G1')$sql$, '23505', 'exact duplicate code');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Code Block 2', 'g1')$sql$, '23505', 'case-insensitive duplicate code');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Code Block 2', '  g1 ')$sql$, '23505', 'padded duplicate code');
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a2', 'Code Block 1', 'G1')) x), 1, 'same code allowed in a different property');

-- empty / whitespace-only code => NULL, and any number of "no code" blocks coexist
SELECT pg_temp.add_block(:'a1', 'No Code A', '');
SELECT pg_temp.add_block(:'a1', 'No Code B', '   ');
SELECT pg_temp.add_block(:'a1', 'No Code C', NULL);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE property_id = :'a1' AND name LIKE 'No Code %' AND code IS NULL), 3,
  'empty / blank / NULL codes are all stored as NULL and do not collide');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.blocks WHERE property_id = :'a1' AND btrim(code) = ''), 0, 'no blank-string codes exist');

-- ---------------------------------------------------------------------------
-- Soft delete frees the name and the code
-- ---------------------------------------------------------------------------
UPDATE public.blocks SET deleted_at = now() WHERE property_id = :'a1' AND name = 'Test Tower';
UPDATE public.blocks SET deleted_at = now() WHERE property_id = :'a1' AND name = 'Code Block 1';
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'TEST TOWER')) x), 1, 'name reusable after the block is soft-deleted');
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Code Block 3', 'g1')) x), 1, 'code reusable after the block is soft-deleted');

-- ---------------------------------------------------------------------------
-- Updates: renaming into a duplicate is refused; unrelated updates never rewrite name/code
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_sqlstate(
  $sql$UPDATE public.blocks SET name = 'girls  BLOCK' WHERE property_id = '11111111-1111-1111-1111-11111111a001' AND name = 'Block-1'$sql$,
  '23505', 'renaming into a duplicate is refused');

RESET ROLE;
ALTER TABLE public.blocks DISABLE TRIGGER trg_blocks_normalize;   -- simulate a legacy, un-normalized row
INSERT INTO public.blocks (tenant_id, property_id, name, code)
VALUES ('11111111-1111-1111-1111-111111111111', :'a1', 'Odd   Legacy  Name', ' X9 ');
ALTER TABLE public.blocks ENABLE TRIGGER trg_blocks_normalize;
UPDATE public.blocks SET status = 'INACTIVE' WHERE property_id = :'a1' AND lower(name) LIKE 'odd%';
SELECT pg_temp.assert_text((SELECT name FROM public.blocks WHERE property_id = :'a1' AND lower(name) LIKE 'odd%'), 'Odd   Legacy  Name',
  'updating an unrelated column does not silently rename an existing block');
SELECT pg_temp.assert_text((SELECT code FROM public.blocks WHERE property_id = :'a1' AND lower(name) LIKE 'odd%'), ' X9 ',
  'updating an unrelated column does not rewrite an existing code');

-- ---------------------------------------------------------------------------
-- Existing permissions unchanged
-- ---------------------------------------------------------------------------
SELECT pg_temp.assume('00000000-0000-0000-0000-000000000020'); -- student_01
SELECT pg_temp.assert_throws($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Student Made Block')$sql$,
  'a student still cannot create a block');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000100'); -- admin_B (other tenant)
SELECT pg_temp.assert_throws($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'Cross Tenant Block')$sql$,
  'another tenant cannot create a block in this property');
RESET ROLE;

SELECT pg_temp.assume('00000000-0000-0000-0000-000000000011'); -- warden (default permissions)
SELECT pg_temp.assert_eq((SELECT count(*) FROM (SELECT pg_temp.add_block(:'a1', 'Warden Wing')) x), 1,
  'a Warden with rooms_beds_create can still create a block (unchanged)');
SELECT pg_temp.assert_sqlstate($sql$SELECT pg_temp.add_block('11111111-1111-1111-1111-11111111a001', 'warden WING')$sql$, '23505',
  'uniqueness applies to Wardens too');
RESET ROLE;

ROLLBACK;
