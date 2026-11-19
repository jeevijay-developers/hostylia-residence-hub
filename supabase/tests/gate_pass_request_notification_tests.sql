-- =============================================================================
-- Gate pass request -> Warden bell notification (fn_notify_wardens_gate_pass_request)
-- (migration 20261126090000_gate_pass_request_notifications.sql)
--
-- One transaction, ROLLED BACK at the end. Passes are inserted / updated as the table owner, which fires the
-- real AFTER triggers. Expected recipients are computed from role_assignments itself, so the test works with
-- whatever wardens the seed holds (it only proves anything if the seeded tenant/property has at least one
-- active WARDEN assignment — a NOTICE says so when it has none).
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/gate_pass_request_notification_tests.sql
--
-- NOTE: NOT executed against a real Supabase stack. The same scenarios ran against a real PostgreSQL 18 with
-- the original gate_passes / notifications / role_assignments definitions and the migration's function;
-- see docs/MEMORY.md.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_int(_actual bigint, _expected bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  END IF;
  RAISE NOTICE 'OK  [%] = %', _label, _actual;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(_cond boolean, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]', _label;
  END IF;
  RAISE NOTICE 'OK  [%]', _label;
END $$;

BEGIN;

CREATE TEMP TABLE fx AS
SELECT s.id AS student_id, s.tenant_id, s.property_id
  FROM public.students s ORDER BY s.created_at LIMIT 1;

-- Wardens who must be told: active WARDEN assignments of the tenant covering the property, any block.
CREATE TEMP TABLE expected AS
SELECT DISTINCT ra.user_id
  FROM public.role_assignments ra, fx
 WHERE ra.tenant_id = fx.tenant_id AND ra.role = 'WARDEN' AND ra.is_active = true
   AND (ra.property_id IS NULL OR ra.property_id = fx.property_id) AND ra.user_id IS NOT NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM expected) = 0 THEN
    RAISE NOTICE 'NOTE: the seeded property has no active WARDEN assignment - recipient checks are vacuous';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mkpass(_status text, _requires_parent boolean DEFAULT false) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.gate_passes (tenant_id, property_id, student_id, pass_number, reason, out_at, expected_in_at, status, requires_parent_approval)
  SELECT fx.tenant_id, fx.property_id, fx.student_id, '', 'Going home (test)', now() + interval '1 day', now() + interval '2 days', _status, _requires_parent
    FROM fx
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION pg_temp.notif_count(_pass uuid, _stage text DEFAULT NULL) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications n
   WHERE n.event_type = 'GATE_PASS_REQUESTED' AND n.payload ->> 'gate_pass_id' = _pass::text
     AND (_stage IS NULL OR n.idempotency_key LIKE '%:' || _stage);
$$;

-- 1. An adult student's request (inserted straight into PENDING_WARDEN) notifies every property warden once ----
CREATE TEMP TABLE p1 AS SELECT pg_temp.mkpass('PENDING_WARDEN') AS id;
SELECT pg_temp.assert_int((SELECT count(*) FROM public.notifications n, p1 WHERE n.payload ->> 'gate_pass_id' = p1.id::text), (SELECT count(*) FROM expected), '1. one notification per warden');
SELECT pg_temp.assert_int((SELECT count(*) FROM expected e WHERE NOT EXISTS (SELECT 1 FROM public.notifications n, p1 WHERE n.payload ->> 'gate_pass_id' = p1.id::text AND n.recipient_user_id = e.user_id)), 0, '1. every expected warden is a recipient');
SELECT pg_temp.assert_int((SELECT count(*) FROM public.notifications n, p1 WHERE n.payload ->> 'gate_pass_id' = p1.id::text AND n.recipient_user_id NOT IN (SELECT user_id FROM expected)), 0, '1. nobody else is notified (other property / tenant, inactive, non-warden)');
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT 1 FROM public.notifications n, p1, fx
   WHERE n.payload ->> 'gate_pass_id' = p1.id::text
     AND NOT (n.channel = 'IN_APP' AND n.status = 'DELIVERED' AND n.event_type = 'GATE_PASS_REQUESTED'
              AND n.template_key = 'gate_pass_requested' AND n.tenant_id = fx.tenant_id AND n.property_id = fx.property_id
              AND n.payload ->> 'audience' = 'WARDEN' AND n.payload ->> 'title' = 'New gate pass request'
              AND n.payload ->> 'body' LIKE '%requested gate pass GP-%' AND n.payload ->> 'body' LIKE '%Going home (test)%'
              AND n.payload ->> 'pass_number' = (SELECT gp.pass_number FROM public.gate_passes gp WHERE gp.id = p1.id)
              AND n.idempotency_key = 'gate_pass_request:' || p1.id || ':' || n.recipient_user_id || ':requested')),
  '1. IN_APP / DELIVERED, bell title + body (student, pass number, reason), audience WARDEN, dedupe key');

-- 2. Re-running the same notification is a no-op (idempotent) ---------------------------------------------------
SELECT pg_temp.assert_true((
  SELECT count(*) FROM (
    SELECT public.fn_enqueue_in_app_notification(n.tenant_id, n.property_id, n.recipient_user_id, n.event_type, n.template_key, n.payload, n.idempotency_key)
      FROM public.notifications n, p1 WHERE n.payload ->> 'gate_pass_id' = p1.id::text) x WHERE x.fn_enqueue_in_app_notification IS NOT NULL) = 0
  AND pg_temp.notif_count((SELECT id FROM p1)) = (SELECT count(*) FROM expected), '2. replaying the same notification creates nothing');

-- 3. A minor's request waits for the parent: nothing at creation, notified when the parent approves ----------------
CREATE TEMP TABLE p2 AS SELECT pg_temp.mkpass('PENDING_PARENT', true) AS id;
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p2)), 0, '3. minor: no notification while PENDING_PARENT');
UPDATE public.gate_passes SET status = 'PENDING_WARDEN' WHERE id = (SELECT id FROM p2);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p2), 'parent-approved'), (SELECT count(*) FROM expected), '3. parent approval -> every warden notified once');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.notifications n, p2 WHERE n.payload ->> 'gate_pass_id' = p2.id::text
  AND NOT (n.payload ->> 'title' = 'Gate pass awaiting your approval' AND n.payload ->> 'body' LIKE '%parent approved gate pass GP-%')), '3. parent-approved wording');
UPDATE public.gate_passes SET status = 'APPROVED' WHERE id = (SELECT id FROM p2);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p2)), (SELECT count(*) FROM expected), '3. the warden approving it later notifies nobody');
UPDATE public.gate_passes SET status = 'PENDING_PARENT' WHERE id = (SELECT id FROM p2);
UPDATE public.gate_passes SET status = 'PENDING_WARDEN' WHERE id = (SELECT id FROM p2);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p2)), (SELECT count(*) FROM expected), '3. the same transition again cannot duplicate (same key)');

-- 4. Statuses that must stay silent -------------------------------------------------------------------------------
CREATE TEMP TABLE p3 AS SELECT pg_temp.mkpass('DRAFT') AS id;
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p3)), 0, '4. DRAFT insert: nothing');
UPDATE public.gate_passes SET status = 'CANCELLED' WHERE id = (SELECT id FROM p3);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p3)), 0, '4. DRAFT -> CANCELLED: nothing');
CREATE TEMP TABLE p4 AS SELECT pg_temp.mkpass('PENDING_PARENT', true) AS id;
UPDATE public.gate_passes SET status = 'REJECTED' WHERE id = (SELECT id FROM p4);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p4)), 0, '4. parent rejection: nothing');
CREATE TEMP TABLE p5 AS SELECT pg_temp.mkpass('PENDING_WARDEN') AS id;
UPDATE public.gate_passes SET status = 'REJECTED' WHERE id = (SELECT id FROM p5);
SELECT pg_temp.assert_int(pg_temp.notif_count((SELECT id FROM p5)), (SELECT count(*) FROM expected), '4. a warden rejecting adds nothing beyond the original request notifications');

-- 5. A notification problem can never fail the gate pass ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enqueue_in_app_notification(
  p_tenant_id uuid, p_property_id uuid, p_recipient_user_id uuid, p_event_type text, p_template_key text, p_payload jsonb, p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'notification subsystem is down (test)'; END $$;
CREATE TEMP TABLE p6 AS SELECT pg_temp.mkpass('PENDING_WARDEN') AS id;
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.gate_passes gp, p6 WHERE gp.id = p6.id AND gp.status = 'PENDING_WARDEN'), '5. enqueue failure: the gate pass is still saved');

-- 6. Hardening: not callable by end users ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  NOT has_function_privilege('authenticated', 'public.fn_notify_wardens_gate_pass_request()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.fn_notify_wardens_gate_pass_request()', 'EXECUTE')
  AND (SELECT prosecdef FROM pg_proc WHERE proname = 'fn_notify_wardens_gate_pass_request'),
  '6. trigger function is SECURITY DEFINER and not executable by authenticated / anon');
SELECT pg_temp.assert_int((SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_gate_passes_notify_wardens_ins', 'trg_gate_passes_notify_wardens_upd') AND NOT tgisinternal), 2, '6. both triggers exist');

ROLLBACK;
