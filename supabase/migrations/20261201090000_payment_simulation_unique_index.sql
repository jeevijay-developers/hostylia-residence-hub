-- Temporary Payment Simulation Mode — atomic duplicate prevention.
--
-- Nothing today prevents two concurrent "simulate payment" requests for the
-- same invoice from both inserting a CAPTURED payments row (payments has no
-- unique constraint beyond its primary key). A partial unique index is the
-- correct, atomic fix: Postgres itself rejects the second concurrent insert,
-- no advisory lock required, because this is a true "has this invoice
-- already been simulate-paid" uniqueness question, not a sequence-number
-- generation problem.
--
-- Scope: only ever applies to provider='simulated' + status='CAPTURED' rows.
-- Real Razorpay payments (provider='razorpay') and manual/offline payments
-- (provider IS NULL) are completely unaffected — an invoice can still
-- legitimately receive multiple partial real/manual payments over time.
--
-- Known, accepted limitation (documented, not hidden): nothing in this
-- codebase ever updates payments.status after insert (refund completion only
-- writes to the separate refunds table), so this index permanently reserves
-- one simulated payment per invoice even after that payment is later
-- refunded. Re-testing the same invoice a second time requires a different
-- invoice/student, or a deliberate, reviewed manual deletion of the test row
-- — never an automatic cleanup.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_simulated_payment_per_invoice
  ON public.payments (invoice_id)
  WHERE provider = 'simulated' AND status = 'CAPTURED';
