-- =============================================================================
-- Notice expiry: fn_expire_notices(), scheduled publishing vs expiry, guard trigger, single cron job
-- (migration 20261122090000_notice_expiry.sql)
--
-- One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/notice_expiry_tests.sql
--
-- NOTE: NOT executed against a real Supabase stack. The same scenarios (44 checks, incl. session-timezone
-- independence and the scheduled publisher) ran against a real PostgreSQL 18 with production functions
-- loaded from the migration files; see docs/MEMORY.md.
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

CREATE TEMP TABLE fx AS SELECT p.id AS prop, p.tenant_id AS tenant FROM public.properties p ORDER BY p.id LIMIT 1;

-- Inserts a notice. A PUBLISHED notice is inserted live and its expiry moved afterwards, because the guard
-- trigger (correctly) refuses to insert an already-expired PUBLISHED notice.
CREATE OR REPLACE FUNCTION pg_temp.mk(_id uuid, _status text, _expires timestamptz, _publish_at timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notices (id, tenant_id, property_id, title, body, status, audience_type, channels, publish_at, expires_at, published_at)
  SELECT _id, tenant, prop, 'T', 'B', _status, 'STUDENTS', ARRAY['IN_APP'], _publish_at,
         CASE WHEN _status = 'PUBLISHED' THEN NULL ELSE _expires END,
         CASE WHEN _status = 'PUBLISHED' THEN now() END
    FROM fx;
  IF _status = 'PUBLISHED' THEN UPDATE public.notices SET expires_at = _expires WHERE id = _id; END IF;
END $$;

SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c1', 'PUBLISHED', now() - interval '1 minute');   -- expired
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c2', 'PUBLISHED', now() + interval '1 hour');     -- live
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c3', 'PUBLISHED', NULL);                           -- no expiry
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c4', 'DRAFT',     now() - interval '1 day');
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c5', 'SCHEDULED', now() - interval '1 day', now() + interval '1 day');  -- not due
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c6', 'CANCELLED', now() - interval '1 day');
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c7', 'SCHEDULED', now() - interval '5 minutes', now() - interval '1 hour'); -- expiry passed before publication
SELECT pg_temp.mk('88888888-0000-0000-0000-0000000000c8', 'SCHEDULED', now() + interval '1 hour', now() - interval '1 minute'); -- due, live

-- 1. the job
SELECT pg_temp.assert_text(public.fn_expire_notices()::text, '1', 'exactly the one PUBLISHED notice past its expiry is expired');
SELECT pg_temp.assert_text((SELECT status FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c1'), 'EXPIRED', 'past expiry -> EXPIRED');
SELECT pg_temp.assert_text((SELECT string_agg(status, ',' ORDER BY id) FROM public.notices WHERE id IN
  ('88888888-0000-0000-0000-0000000000c2','88888888-0000-0000-0000-0000000000c3','88888888-0000-0000-0000-0000000000c4',
   '88888888-0000-0000-0000-0000000000c5','88888888-0000-0000-0000-0000000000c6')),
  'PUBLISHED,PUBLISHED,DRAFT,SCHEDULED,CANCELLED', 'future / no expiry stay published; draft, scheduled, cancelled are never expired');
SELECT pg_temp.assert_text(public.fn_expire_notices()::text, '0', 'idempotent: second run expires nothing');
SELECT pg_temp.assert_text(public.fn_expire_notices()::text, '0', 'idempotent: third run expires nothing');

-- 2. scheduled publishing: expiry before publication is never delivered
SELECT public.fn_publish_scheduled_notices();
SELECT pg_temp.assert_text((SELECT status FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c7'), 'EXPIRED', 'expired before publication -> EXPIRED, not published');
SELECT pg_temp.assert_text((SELECT (published_at IS NULL)::text FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c7'), 'true', '  and never marked published');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notifications WHERE idempotency_key LIKE 'notice:88888888-0000-0000-0000-0000000000c7:%'), '0', '  and nothing delivered');
SELECT pg_temp.assert_text((SELECT status FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c8'), 'PUBLISHED', 'due + live scheduled notice is published');
SELECT pg_temp.assert_text((SELECT status FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c5'), 'SCHEDULED', 'not-yet-due scheduled notice untouched (even with a past expiry)');

-- 3. guard trigger
SELECT pg_temp.assert_fails($$INSERT INTO public.notices (tenant_id, property_id, title, body, status, expires_at)
  SELECT tenant, prop, 'T', 'B', 'PUBLISHED', now() - interval '1 minute' FROM fx$$, 'insert an already-expired PUBLISHED notice');
SELECT pg_temp.assert_fails($$UPDATE public.notices SET status = 'PUBLISHED' WHERE id = '88888888-0000-0000-0000-0000000000c4'$$, 'publish an expired draft');
SELECT pg_temp.assert_fails($$UPDATE public.notices SET status = 'PUBLISHED' WHERE id = '88888888-0000-0000-0000-0000000000c1'$$, 'revive an EXPIRED notice');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM public.notices WHERE id = '88888888-0000-0000-0000-0000000000c1' AND status = 'EXPIRED'), '1', 'still EXPIRED');

-- 4. exactly one expiry job, every 5 minutes; the publisher job is unchanged
SELECT pg_temp.assert_text((SELECT count(*)::text FROM cron.job WHERE jobname = 'expire-notices'), '1', 'one expire-notices job');
SELECT pg_temp.assert_text((SELECT schedule FROM cron.job WHERE jobname = 'expire-notices'), '*/5 * * * *', 'every 5 minutes');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM cron.job WHERE jobname = 'publish-scheduled-notices'), '1', 'one publish-scheduled-notices job');
-- 5. nobody but the scheduler may run it
SELECT pg_temp.assert_text(has_function_privilege('authenticated', 'public.fn_expire_notices()', 'EXECUTE')::text, 'false', 'authenticated cannot run the expiry job');

ROLLBACK;
