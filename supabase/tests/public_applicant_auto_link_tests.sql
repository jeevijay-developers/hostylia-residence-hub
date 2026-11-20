-- =============================================================================
-- Public applicant auto-link assertions
-- (migration 20261128090000_public_applicant_auto_link.sql)
--
-- One transaction, ROLLED BACK. Prereqs: supabase db reset (migrations + seed.sql)
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/public_applicant_auto_link_tests.sql
-- Seed facts: tenant A 1111..., property A1 ...a001; admin_B (other tenant) = ...0100.
-- Fixtures create their own auth.users rows (superuser).
-- =============================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_actual text, _expected text, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  END IF;
  RAISE NOTICE 'OK  [%] = %', _label, _actual;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mkuser(_id uuid, _email text, _email_ok boolean, _phone text, _phone_ok boolean)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, raw_user_meta_data)
  VALUES (_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          _email, CASE WHEN _email_ok THEN now() END, _phone, CASE WHEN _phone_ok THEN now() END, '{}'::jsonb);
$$;

BEGIN;

-- Applicants (public form origin) in tenant A / property A1
INSERT INTO public.students (id, tenant_id, property_id, admission_number, full_name, email, phone, status, metadata) VALUES
 ('99999999-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-1','Email Applicant','email.ok@example.test','+919000000001','APPLICANT','{"source":"public_admission","origin":"apply_form"}'),
 ('99999999-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-2','Phone Applicant','phone.ok@example.test','+919000000002','APPLICANT','{"source":"public_admission","origin":"apply_form"}'),
 ('99999999-0000-0000-0000-0000000000b3','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-3','Conflict A','conflict.a@example.test','+919000000003','APPLICANT','{"origin":"apply_form"}'),
 ('99999999-0000-0000-0000-0000000000b4','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-4','Conflict B','conflict.b@example.test','+919000000004','APPLICANT','{"origin":"apply_form"}'),
 ('99999999-0000-0000-0000-0000000000b5','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-5','Signup Applicant (no origin)','signup.app@example.test','+919000000005','APPLICANT','{"source":"public_admission"}'),
 ('99999999-0000-0000-0000-0000000000b6','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-11111111a001','T-AL-6','Unverified','unverified@example.test','+919000000006','APPLICANT','{"origin":"apply_form"}');

-- 1. verified email -> linked, stays APPLICANT, STUDENT role + membership
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c1','email.ok@example.test',true,NULL,false);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c1')->>'linked'), 'true', 'verified email links');
SELECT pg_temp.assert_eq((SELECT profile_id::text FROM public.students WHERE id='99999999-0000-0000-0000-0000000000b1'), '99999999-0000-0000-0000-0000000000c1', 'profile_id set');
SELECT pg_temp.assert_eq((SELECT status FROM public.students WHERE id='99999999-0000-0000-0000-0000000000b1'), 'APPLICANT', 'status remains APPLICANT');
SELECT pg_temp.assert_eq((SELECT count(*)::text FROM public.role_assignments WHERE user_id='99999999-0000-0000-0000-0000000000c1' AND role='STUDENT'), '1', 'STUDENT role granted');
SELECT pg_temp.assert_eq((SELECT count(*)::text FROM public.audit_logs WHERE action='APPLICANT_AUTO_LINKED' AND entity_id='99999999-0000-0000-0000-0000000000b1'), '1', 'audit row');
-- idempotent / no overwrite
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c1')->>'reason'), 'already_linked', 'second call is a no-op');

-- 2. verified phone (different formatting) -> linked
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c2',NULL,false,'919000000002',true);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c2')->>'linked'), 'true', 'verified phone links');

-- 3. unverified contact -> no link
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c3','unverified@example.test',false,'919000000006',false);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c3')->>'reason'), 'no_verified_contact', 'unverified contact not linked');
SELECT pg_temp.assert_eq((SELECT profile_id::text FROM public.students WHERE id='99999999-0000-0000-0000-0000000000b6'), NULL, 'unverified applicant untouched');

-- 4. email matches one applicant, phone another -> conflict, no link
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c4','conflict.a@example.test',true,'919000000004',true);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c4')->>'reason'), 'ambiguous', 'email/phone conflict not linked');

-- 5. no matching application -> harmless no-op
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c5','nobody@example.test',true,NULL,false);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c5')->>'reason'), 'no_match', 'no match is a no-op');

-- 6. record without apply_form origin (signup-wizard / admin-created) is not auto-linked
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c6','signup.app@example.test',true,NULL,false);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c6')->>'reason'), 'not_public_applicant', 'non-public-form record not auto-linked');

-- 7. record already linked to someone else is never overwritten
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c7',NULL,false,'919000000001',true);
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c7')->>'reason'), 'record_already_linked', 'second account on an already-linked record is not linked');
SELECT pg_temp.assert_eq((SELECT profile_id::text FROM public.students WHERE id='99999999-0000-0000-0000-0000000000b1'), '99999999-0000-0000-0000-0000000000c1', 'existing profile_id not overwritten');

-- 8. cross-tenant: user already a member of another tenant is not linked into this one
SELECT pg_temp.mkuser('99999999-0000-0000-0000-0000000000c8','conflict.b@example.test',true,NULL,false);
INSERT INTO public.tenant_memberships (tenant_id, user_id, status)
  SELECT t.id, '99999999-0000-0000-0000-0000000000c8', 'ACTIVE' FROM public.tenants t
   WHERE t.id <> '11111111-1111-1111-1111-111111111111' LIMIT 1;
SELECT pg_temp.assert_eq((public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c8')->>'reason'), 'tenant_conflict', 'cross-tenant account not linked');

-- 9. not callable by clients
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.fn_link_public_applicant('99999999-0000-0000-0000-0000000000c5');
    RAISE EXCEPTION 'ASSERT FAIL: authenticated could call fn_link_public_applicant';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK  [authenticated cannot call linker]';
  END;
END $$;
RESET ROLE;

ROLLBACK;
