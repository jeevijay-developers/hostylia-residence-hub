-- =============================================================================
-- Invoice OVERDUE job, gateway-confirmed refunds and invoice refund accounting
-- (migration 20261109090000_invoice_overdue_and_refund_gateway_accounting.sql)
--
-- Same harness style as rls_tests.sql. One transaction, ROLLED BACK at the end.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/finance_overdue_refund_tests.sql
--
-- Requires migrations 20261109090000 AND 20261110090000.
-- NOTE: this file has NOT been executed against a real Postgres. The same scenarios (plus timezone,
-- retry, replay, deposit-ledger and backfill cases) were run in-process on PGlite; see docs/MEMORY.md.
-- Fixture ids/roles below follow the seed used by rls_tests.sql; adjust if your seed differs.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(_actual bigint, _expected bigint, _label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _actual IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', _label, _expected, _actual;
  END IF;
  RAISE NOTICE 'OK  [%] = %', _label, _actual;
END $$;

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

-- fixtures (superuser): one invoice 5 days past due, one not yet due
INSERT INTO public.invoices (id, tenant_id, property_id, student_id, invoice_number, issue_date, due_date,
                             status, subtotal_paise, total_paise, balance_paise)
SELECT i.id, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-11111111a001', s.id, i.num,
       current_date - 40, current_date + i.due_off, 'ISSUED', 10000, 10000, 10000
  FROM (VALUES ('99999999-0000-0000-0000-0000000000f1'::uuid, 'T-OVD', -5),
               ('99999999-0000-0000-0000-0000000000f2'::uuid, 'T-FUT', 5)) i(id, num, due_off)
  CROSS JOIN LATERAL (SELECT id FROM public.students ORDER BY created_at LIMIT 1) s;

-- 1. overdue job
SELECT public.fn_mark_overdue_invoices();
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1'),
  'OVERDUE', 'unpaid past-due invoice -> OVERDUE');
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f2'),
  'ISSUED', 'not-yet-due invoice untouched');
SELECT pg_temp.assert_eq(public.fn_mark_overdue_invoices()::bigint, 0, 'job is idempotent (second run changes nothing)');

-- 2. payments: partial keeps OVERDUE, full -> PAID
INSERT INTO public.payments (id, tenant_id, property_id, student_id, invoice_id, mode, provider,
                             provider_payment_ref, amount_paise, status)
SELECT '99999999-0000-0000-0000-0000000000e1', tenant_id, property_id, student_id, id, 'UPI', 'razorpay',
       'pay_TEST_1', 4000, 'CAPTURED'
  FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1';
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1'),
  'OVERDUE', 'partial payment keeps a past-due invoice OVERDUE');
INSERT INTO public.payments (id, tenant_id, property_id, student_id, invoice_id, mode, provider,
                             provider_payment_ref, amount_paise, status)
SELECT '99999999-0000-0000-0000-0000000000e2', tenant_id, property_id, student_id, id, 'UPI', 'razorpay',
       'pay_TEST_2', 6000, 'CAPTURED'
  FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1';
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1'),
  'PAID', 'full payment -> PAID');

-- 3. refund of 4000 on the first payment; approval alone must not change the invoice
INSERT INTO public.refunds (id, tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode,
                            status, initiated_by)
SELECT '99999999-0000-0000-0000-0000000000d1', tenant_id, property_id, student_id, id, 4000, 'test',
       'ORIGINAL_METHOD', 'PENDING_APPROVAL', '00000000-0000-0000-0000-000000000013'
  FROM public.payments WHERE id = '99999999-0000-0000-0000-0000000000e1';
UPDATE public.refunds
   SET status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000010', approved_at = now()
 WHERE id = '99999999-0000-0000-0000-0000000000d1';
SELECT pg_temp.assert_eq((SELECT refunded_paise FROM public.invoices
  WHERE id = '99999999-0000-0000-0000-0000000000f1'), 0, 'approval alone: refunded_paise still 0');

-- 4. staff starts processing; duplicates / manual completion / staff verdicts are refused
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated"}', true);
SELECT public.fn_start_refund_processing('99999999-0000-0000-0000-0000000000d1');
SELECT pg_temp.assert_fails($$SELECT public.fn_start_refund_processing('99999999-0000-0000-0000-0000000000d1')$$,
  'a second start is rejected (no duplicate processing)');
SELECT pg_temp.assert_fails($$SELECT public.fn_complete_refund('99999999-0000-0000-0000-0000000000d1','COMPLETED','MANUAL-1',NULL)$$,
  'a gateway refund cannot be completed by hand');
SELECT pg_temp.assert_fails($$SELECT public.fn_record_refund_gateway_result('99999999-0000-0000-0000-0000000000d1','rfnd_T1','processed',4000)$$,
  'staff cannot report a gateway verdict');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000100","role":"authenticated"}', true);
SELECT pg_temp.assert_fails($$SELECT public.fn_start_refund_processing('99999999-0000-0000-0000-0000000000d1')$$,
  'another tenant cannot touch the refund');
RESET ROLE;

-- 5. gateway verdicts (service role): pending, wrong amount, success, replay
SELECT set_config('role', 'service_role', true);
SELECT public.fn_record_refund_gateway_result('99999999-0000-0000-0000-0000000000d1', 'rfnd_T1', 'pending', 4000);
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-0000000000d1'),
  'PROCESSING', 'gateway pending: still PROCESSING');
SELECT pg_temp.assert_fails($$SELECT public.fn_record_refund_gateway_result('99999999-0000-0000-0000-0000000000d1','rfnd_T1','processed',3999)$$,
  'a mismatching gateway amount is refused');
SELECT public.fn_record_refund_gateway_result('99999999-0000-0000-0000-0000000000d1', 'rfnd_T1', 'processed', 4000);
SELECT public.fn_record_refund_gateway_result('99999999-0000-0000-0000-0000000000d1', 'rfnd_T1', 'processed', 4000);
RESET ROLE;

-- 6. accounting after confirmed refund
SELECT pg_temp.assert_text((SELECT status FROM public.refunds WHERE id = '99999999-0000-0000-0000-0000000000d1'),
  'COMPLETED', 'verified gateway success completes the refund');
SELECT pg_temp.assert_eq((SELECT refunded_paise FROM public.invoices
  WHERE id = '99999999-0000-0000-0000-0000000000f1'), 4000, 'refunded_paise = 4000 (counted once despite replay)');
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = '99999999-0000-0000-0000-0000000000f1'),
  'OVERDUE', 'partially refunded + balance + past due (migration 20261110090000) -> OVERDUE, not PARTIALLY_REFUNDED');
SELECT pg_temp.assert_eq((SELECT balance_paise FROM public.invoices
  WHERE id = '99999999-0000-0000-0000-0000000000f1'), 4000, 'balance re-opens by the refunded amount (total - (paid - refunded))');
SELECT pg_temp.assert_eq((SELECT paid_paise FROM public.invoices
  WHERE id = '99999999-0000-0000-0000-0000000000f1'), 10000, 'paid_paise stays the gross captured amount');
SELECT pg_temp.assert_text((SELECT status FROM public.payments WHERE id = '99999999-0000-0000-0000-0000000000e1'),
  'CAPTURED', 'the payment record itself is untouched');
SELECT pg_temp.assert_fails($$INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, amount_paise, reason, mode, status, initiated_by)
  SELECT tenant_id, property_id, student_id, id, 4001, 'x', 'ORIGINAL_METHOD', 'PENDING_APPROVAL', '00000000-0000-0000-0000-000000000013'
    FROM public.payments WHERE id = '99999999-0000-0000-0000-0000000000e1'$$,
  'a refund beyond the refundable payment balance is rejected');

ROLLBACK;
