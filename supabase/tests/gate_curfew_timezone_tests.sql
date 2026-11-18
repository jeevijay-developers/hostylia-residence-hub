-- =============================================================================
-- Gate-entry curfew uses the PROPERTY's timezone (fn_check_gatepass_curfew)
-- (migration 20261125090000_gatepass_curfew_property_timezone.sql)
--
-- One transaction, ROLLED BACK at the end. The seeded property's timezone / curfew are changed inside the
-- transaction only. Entries are inserted as the table owner, which fires the real trigger trg_ge_curfew.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/gate_curfew_timezone_tests.sql
--
-- NOTE: NOT executed against a real Supabase stack. The same scenarios ran against a real PostgreSQL 18 with the
-- original gate tables and the migration's function (before/after comparison); see docs/MEMORY.md.
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

BEGIN;

CREATE TEMP TABLE fx AS
SELECT s.id AS student_id, s.tenant_id, s.property_id
  FROM public.students s ORDER BY s.created_at LIMIT 1;

-- sets the property's timezone column and curfew_time (NULL curfew = leave the policy unset -> default 21:00)
CREATE OR REPLACE FUNCTION pg_temp.setprop(_tz text, _curfew text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.properties p
     SET timezone = _tz,
         settings = (coalesce(p.settings, '{}'::jsonb) - 'curfew_time')
                    || CASE WHEN _curfew IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('curfew_time', _curfew) END
    FROM fx WHERE p.id = fx.property_id;
$$;

-- records one gate event and returns the is_late the trigger computed ("true" / "false")
CREATE OR REPLACE FUNCTION pg_temp.ev(_at timestamptz, _dir text DEFAULT 'IN', _gp uuid DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  INSERT INTO public.gate_events (tenant_id, property_id, student_id, gate_pass_id, direction, method, event_at,
                                  recorded_by, idempotency_key)
  SELECT tenant_id, property_id, student_id, _gp, _dir, 'MANUAL', _at, gen_random_uuid(), gen_random_uuid()::text
    FROM fx
  RETURNING is_late::text;
$$;

-- 1. Asia/Kolkata, default curfew 21:00 (strictly after = late; exactly at = on time)
SELECT pg_temp.setprop('Asia/Kolkata');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:00:00+00'), 'false', 'IST: 20:30 IST (15:00 UTC) is before the curfew');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:30:00+00'), 'false', 'IST: 21:00:00 IST (15:30 UTC) is exactly AT the curfew = on time (it is NOT read as 3:30 PM)');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:30:01+00'), 'true',  'IST: 21:00:01 IST is after the curfew = LATE');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:00:00+00'), 'true',  'IST: 21:30 IST (16:00 UTC) is LATE (the old UTC rule said on time)');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 21:30:00+00'), 'false', 'IST: 03:00 IST next day (21:30 UTC) is not flagged by the plain time-of-day rule (the old UTC rule flagged it)');
SELECT pg_temp.assert_text((SELECT (event_at = '2031-01-15 15:30:01+00')::text FROM public.gate_events WHERE event_at = '2031-01-15 15:30:01+00' LIMIT 1), 'true', 'event_at is stored exactly as given (never rewritten)');

-- 2. a configured curfew other than the default
SELECT pg_temp.setprop('Asia/Kolkata', '22:30');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 17:00:00+00'), 'false', 'curfew 22:30: 22:30 IST exactly = on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 17:01:00+00'), 'true',  'curfew 22:30: 22:31 IST = late');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:30:00+00'), 'false', 'curfew 22:30: 22:00 IST (previously late by the 21:00 default) = on time');
SELECT pg_temp.setprop('Asia/Kolkata', 'not-a-time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:00:00+00'), 'true', 'a malformed curfew value still falls back to 21:00 (existing rule): 21:30 IST late');

-- 3. properties in other timezones (curfew 21:00 local)
SELECT pg_temp.setprop('Asia/Dubai');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 17:00:00+00'), 'false', 'Dubai (UTC+4): 21:00 local = on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 17:01:00+00'), 'true',  'Dubai: 21:01 local = late');
SELECT pg_temp.setprop('America/New_York');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-16 02:00:00+00'), 'false', 'New York winter (UTC-5): 21:00 EST on 15 Jan = on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-16 02:00:01+00'), 'true',  'New York winter: 21:00:01 EST = late');
SELECT pg_temp.assert_text(pg_temp.ev('2031-07-16 01:00:00+00'), 'false', 'New York summer (UTC-4, DST): 21:00 EDT = on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-07-16 01:00:01+00'), 'true',  'New York summer: 21:00:01 EDT = late (DST handled)');
SELECT pg_temp.setprop('UTC');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 21:00:00+00'), 'false', 'UTC property: 21:00 UTC = on time (old behaviour preserved for UTC)');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 21:00:01+00'), 'true',  'UTC property: 21:00:01 UTC = late');

-- 4. missing / blank / invalid timezone falls back to Asia/Kolkata (and never blocks the entry)
SELECT pg_temp.setprop('');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:30:00+00'), 'false', 'blank timezone -> Asia/Kolkata: 21:00 IST on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:00:00+00'), 'true',  'blank timezone -> Asia/Kolkata: 21:30 IST late');
SELECT pg_temp.setprop('Mars/Olympus_Mons');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:30:00+00'), 'false', 'invalid timezone name -> Asia/Kolkata: insert succeeds, 21:00 IST on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 15:30:01+00'), 'true',  'invalid timezone name -> Asia/Kolkata: 21:00:01 IST late');

-- 5. Out-Pass workflow: returning after the pass's expected return time is late whatever the clock says;
--    OUT events and visitor-style rows are untouched
SELECT pg_temp.setprop('Asia/Kolkata');
CREATE TEMP TABLE gp AS
WITH ins AS (
  INSERT INTO public.gate_passes (tenant_id, property_id, student_id, reason, out_at, expected_in_at, status)
  SELECT tenant_id, property_id, student_id, 'curfew tz test', '2031-01-15 04:30:00+00', '2031-01-15 13:30:00+00', 'ACTIVE'  -- expected back 19:00 IST
    FROM fx
  RETURNING id)
SELECT id FROM ins;
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 13:00:00+00', 'IN', (SELECT id FROM gp)), 'false', 'pass: back at 18:30 IST, before expected 19:00 and before curfew = on time');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 14:00:00+00', 'IN', (SELECT id FROM gp)), 'true',  'pass: back at 19:30 IST, after expected 19:00 (still before curfew) = late');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:00:00+00', 'IN', (SELECT id FROM gp)), 'true',  'pass: back at 21:30 IST = late (both rules)');
SELECT pg_temp.assert_text(pg_temp.ev('2031-01-15 16:00:00+00', 'OUT', (SELECT id FROM gp)), 'false', 'an OUT event is never late');

ROLLBACK;
