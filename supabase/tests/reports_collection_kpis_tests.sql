-- =============================================================================
-- Reports: Collection Rate (invoice cohort) / Overdue Invoices + complete aging list
-- (migrations 20261123090000_reports_collection_kpis.sql and 20261124090000_collection_rate_invoice_cohort.sql)
--
-- One transaction, ROLLED BACK at the end. Invoices are inserted with their accounting columns set directly
-- (balance_paise drives pending / overdue), and the CAPTURED payments / COMPLETED refunds that the collection
-- rate is computed from are inserted as real payments / refunds rows.
-- Prereqs:  supabase db reset   (migrations + seed.sql)
-- Run:      psql -v ON_ERROR_STOP=1 -f supabase/tests/reports_collection_kpis_tests.sql
--
-- NOTE: NOT executed against a real Supabase stack. The same scenarios ran against a real PostgreSQL 18 with the
-- production view and invoice accounting function loaded from the migration files; see docs/MEMORY.md.
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

-- a property + student to bill (any seeded student)
CREATE TEMP TABLE fx AS
SELECT s.id AS student_id, s.tenant_id, s.property_id
  FROM public.students s ORDER BY s.created_at LIMIT 1;

-- inserts one invoice: status, total, paid, refunded, balance, issue offset (days from a fixed base), due offset from today
CREATE OR REPLACE FUNCTION pg_temp.inv(_n text, _status text, _total bigint, _paid bigint, _refunded bigint, _balance bigint,
                                       _issue date, _due_offset int, _deleted boolean DEFAULT false) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.invoices (tenant_id, property_id, student_id, invoice_number, issue_date, due_date, status,
                               subtotal_paise, total_paise, paid_paise, refunded_paise, balance_paise, deleted_at)
  SELECT tenant_id, property_id, student_id, 'RPT-TEST-' || _n, _issue,
         ((now() AT TIME ZONE coalesce((SELECT timezone FROM public.properties p WHERE p.id = fx.property_id), 'Asia/Kolkata'))::date + _due_offset),
         _status, _total, _total, _paid, _refunded, _balance, CASE WHEN _deleted THEN now() END
    FROM fx;
$$;

-- adds a payment row to the invoice _n (status CAPTURED unless given); returns nothing. _paid_at is the payment's own date.
CREATE OR REPLACE FUNCTION pg_temp.pay(_n text, _amount bigint, _status text DEFAULT 'CAPTURED', _paid_at timestamptz DEFAULT now()) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.payments (tenant_id, property_id, student_id, invoice_id, payment_number, mode, amount_paise, status, paid_at)
  SELECT i.tenant_id, i.property_id, i.student_id, i.id, 'RPT-PAY-' || _n || '-' || gen_random_uuid(), 'CASH', _amount, _status, _paid_at
    FROM public.invoices i WHERE i.invoice_number = 'RPT-TEST-' || _n;
$$;

-- adds a refund row against the FIRST payment of the invoice _n
CREATE OR REPLACE FUNCTION pg_temp.refund(_n text, _amount bigint, _status text DEFAULT 'COMPLETED') RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.refunds (tenant_id, property_id, student_id, payment_id, refund_number, amount_paise, reason, mode, status, initiated_by)
  SELECT p.tenant_id, p.property_id, p.student_id, p.id, 'RPT-REF-' || _n || '-' || gen_random_uuid(), _amount, 'test', 'CASH', _status,
         (SELECT id FROM public.profiles LIMIT 1)
    FROM public.payments p JOIN public.invoices i ON i.id = p.invoice_id
   WHERE i.invoice_number = 'RPT-TEST-' || _n ORDER BY p.created_at LIMIT 1;
$$;

-- issued 2031-03-10 (far from any real data), so the period below contains only these fixtures
SELECT pg_temp.inv('A', 'PAID',               1000, 1000,   0,    0, '2031-03-10',  10);   -- paid
SELECT pg_temp.inv('B', 'ISSUED',             1000,    0,   0, 1000, '2031-03-10',  10);   -- unpaid, not yet due
SELECT pg_temp.inv('C', 'PARTIALLY_PAID',     1000,  400,   0,  600, '2031-03-10',  10);   -- partially paid, not due
SELECT pg_temp.inv('D', 'OVERDUE',            1000,    0,   0, 1000, '2031-03-10',  -5);   -- unpaid, overdue
SELECT pg_temp.inv('E', 'OVERDUE',            1000,  400,   0,  600, '2031-03-10',  -5);   -- partially paid, overdue
SELECT pg_temp.inv('F', 'VOID',               5000,    0,   0, 5000, '2031-03-10',  -5);   -- VOID: excluded
SELECT pg_temp.inv('G', 'OVERDUE',            1000, 1000, 300,  300, '2031-03-10',  -5);   -- partially refunded, balance re-opened, overdue
SELECT pg_temp.inv('H', 'REFUNDED',            800,  800, 800,    0, '2031-03-10',  10);   -- fully refunded: excluded
SELECT pg_temp.inv('I', 'DRAFT',              9000,    0,   0, 9000, '2031-03-10',  -5);   -- draft: excluded
SELECT pg_temp.inv('J', 'OVERDUE',            7000,    0,   0, 7000, '2031-03-10',  -5, true);  -- soft-deleted: excluded
SELECT pg_temp.inv('K', 'ISSUED',             1000,    0,   0, 1000, '2031-04-01',  -5);   -- issued in another month

-- the payments / refunds behind them (the collection rate reads these rows, not the cached columns)
SELECT pg_temp.pay('A', 1000);
SELECT pg_temp.pay('C',  400);
SELECT pg_temp.pay('E',  400);
SELECT pg_temp.pay('G', 1000); SELECT pg_temp.refund('G', 300);
SELECT pg_temp.pay('H',  800); SELECT pg_temp.refund('H', 800);   -- fully refunded invoice (excluded)
SELECT pg_temp.pay('B',  777, 'FAILED');                          -- a failed attempt never counts as received

-- 1. the report for March 2031
CREATE TEMP TABLE r AS
SELECT x.* FROM fx, LATERAL public.fn_collection_report(fx.property_id, '2031-03-01', '2031-03-31') x;

SELECT pg_temp.assert_text((SELECT eligible_invoice_count::text FROM r), '6', 'eligible: A,B,C,D,E,G (VOID, DRAFT, fully refunded, deleted and the April invoice are not)');
SELECT pg_temp.assert_text((SELECT billed_paise::text FROM r), '6000', 'billed = 6 x 1000');
SELECT pg_temp.assert_text((SELECT received_paise::text FROM r), '2800', 'received = CAPTURED payments (A 1000, C 400, E 400, G 1000; B''s FAILED 777 ignored)');
SELECT pg_temp.assert_text((SELECT refunded_paise::text FROM r), '300', 'refunded = completed refunds');
SELECT pg_temp.assert_text((SELECT collected_paise::text FROM r), '2500', 'collected = 2800 received - 300 refunded');
SELECT pg_temp.assert_text((SELECT collection_rate_pct::text FROM r), '41.67', 'collection rate = 2500 / 6000 = 41.67 %');
SELECT pg_temp.assert_text((SELECT pending_paise::text FROM r), '3500', 'pending = B 1000 + C 600 + D 1000 + E 600 + G 300');
SELECT pg_temp.assert_text((SELECT due_unpaid_count::text FROM r), '5', 'due-unpaid invoices (B, C, D, E, G)');
SELECT pg_temp.assert_text((SELECT overdue_count::text FROM r), '3', 'overdue = D, E, G (partially paid / refunded included, not-yet-due excluded)');
SELECT pg_temp.assert_text((SELECT overdue_balance_paise::text FROM r), '1900', 'overdue balance = 1000 + 600 + 300');
SELECT pg_temp.assert_text((SELECT overdue_pct::text FROM r), '60.00', 'overdue % = 3 / 5');

-- 2. date range: inclusive boundaries, all-time, empty and zero-billing handled safely
SELECT pg_temp.assert_text((SELECT billed_paise::text FROM fx, public.fn_collection_report(fx.property_id, '2031-03-10', '2031-03-10')), '6000', 'single-day range includes the issue date (inclusive)');
SELECT pg_temp.assert_text((SELECT eligible_invoice_count::text FROM fx, public.fn_collection_report(fx.property_id, '2031-03-11', '2031-03-31')), '0', 'a range starting the day after: nothing');
SELECT pg_temp.assert_text((SELECT collection_rate_pct::text || '/' || overdue_pct::text FROM fx, public.fn_collection_report(fx.property_id, '2031-03-11', '2031-03-31')), '0/0', 'zero billing / zero unpaid: both percentages are 0, no division error');
SELECT pg_temp.assert_text((SELECT (billed_paise >= 7000)::text FROM fx, public.fn_collection_report(fx.property_id, '2031-03-01', '2031-04-30')), 'true', 'a wider range adds the April invoice (7000 billed)');
SELECT pg_temp.assert_text((SELECT (count(*) = 1)::text FROM fx, public.fn_collection_report(fx.property_id)), 'true', 'no range (all time): still exactly one row');

-- 2b. invoice cohort: payments and refunds follow the invoice, whatever their own dates / states
--   M: PAID, paid the month AFTER issue (cross-month payment)       -> counts in the issue month
--   N: PARTIALLY_PAID: CAPTURED 200 + FAILED 500 + CREATED 300      -> only the CAPTURED 200 counts
--   O: PARTIALLY_REFUNDED: CAPTURED 1000, COMPLETED refund 400, PENDING_APPROVAL refund 200 -> refunded 400 only
--   P: cache says unpaid but a CAPTURED 500 payment row exists      -> the payment rows are the source of truth
SELECT pg_temp.inv('M', 'PAID',               1000, 1000,   0,    0, '2031-06-10',  -5);
SELECT pg_temp.inv('N', 'PARTIALLY_PAID',     1000,  200,   0,  800, '2031-06-10',  -5);
SELECT pg_temp.inv('O', 'PARTIALLY_REFUNDED', 1000, 1000, 400,  400, '2031-06-10',  -5);
SELECT pg_temp.inv('P', 'ISSUED',             1000,    0,   0, 1000, '2031-06-10',  -5);
SELECT pg_temp.pay('M', 1000, 'CAPTURED', '2031-07-15 10:00+05:30');
SELECT pg_temp.pay('N',  200); SELECT pg_temp.pay('N', 500, 'FAILED'); SELECT pg_temp.pay('N', 300, 'CREATED');
SELECT pg_temp.pay('O', 1000); SELECT pg_temp.refund('O', 400); SELECT pg_temp.refund('O', 200, 'PENDING_APPROVAL');
SELECT pg_temp.pay('P',  500);

CREATE TEMP TABLE r2 AS
SELECT x.* FROM fx, LATERAL public.fn_collection_report(fx.property_id, '2031-06-01', '2031-06-30') x;
SELECT pg_temp.assert_text((SELECT billed_paise::text FROM r2), '4000', 'June cohort billed = M,N,O,P');
SELECT pg_temp.assert_text((SELECT received_paise::text FROM r2), '2700', 'received = M 1000 (paid in July) + N 200 + O 1000 + P 500');
SELECT pg_temp.assert_text((SELECT refunded_paise::text FROM r2), '400', 'refunded = O''s COMPLETED 400 (PENDING_APPROVAL ignored)');
SELECT pg_temp.assert_text((SELECT collection_rate_pct::text FROM r2), '57.50', 'rate = (2700 - 400) / 4000 = 57.50 %');
SELECT pg_temp.assert_text((SELECT billed_paise::text || '/' || received_paise::text FROM fx, public.fn_collection_report(fx.property_id, '2031-07-01', '2031-07-31')), '0/0', 'the July payment does not make July a billing month (cohort follows the issue date)');

-- 3. the aging list / buckets: unpaid invoices, complete, with the exact total on every row
SELECT pg_temp.assert_text((SELECT (count(*) >= 7)::text FROM fx, public.fn_aging_invoices(fx.property_id, 1000, 0)), 'true', 'aging list returns the unpaid test invoices (no cap)');
SELECT pg_temp.assert_text((SELECT (min(total_count) = max(total_count) AND min(total_count) = count(*))::text FROM fx, public.fn_aging_invoices(fx.property_id, 1000, 0)), 'true', 'every row carries the exact total');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM fx, public.fn_aging_invoices(fx.property_id, 3, 0)), '3', 'page size is honoured (3 rows)');
SELECT pg_temp.assert_text((SELECT (sum(balance_paise) > 0)::text FROM fx, public.fn_aging_buckets(fx.property_id)), 'true', 'aging buckets are summed in the database');
SELECT pg_temp.assert_text((SELECT count(*)::text FROM fx, public.fn_aging_invoices(fx.property_id, 1000, 0) a WHERE a.status IN ('PAID', 'VOID', 'REFUNDED')), '0', 'PAID / VOID / REFUNDED never appear in the aging list');

-- 4. privileges: read-only functions for signed-in users only, run with the caller's rights
SELECT pg_temp.assert_text(has_function_privilege('authenticated', 'public.fn_collection_report(uuid, date, date)', 'EXECUTE')::text, 'true', 'authenticated can run the report');
SELECT pg_temp.assert_text(has_function_privilege('anon', 'public.fn_collection_report(uuid, date, date)', 'EXECUTE')::text, 'false', 'anon cannot');
SELECT pg_temp.assert_text((SELECT bool_and(NOT prosecdef)::text FROM pg_proc WHERE proname IN ('fn_collection_report', 'fn_aging_buckets', 'fn_aging_invoices')), 'true', 'SECURITY INVOKER: the caller''s RLS applies');

ROLLBACK;
