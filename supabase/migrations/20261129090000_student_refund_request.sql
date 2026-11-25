-- Part 1 of the new Refund Management workflow: lets a student submit their own
-- refund request against their own CAPTURED payment, using the EXISTING
-- `initiateRefund` server function (src/lib/finance.functions.ts) unchanged —
-- no duplicate refund-creation logic. `initiateRefund` already derives
-- `tenant_id`/`property_id`/`student_id` purely from the payment row it reads
-- with the caller's own RLS-scoped client, and `payments_student_read` RLS
-- already restricts that read to the caller's own payments — so this
-- migration only needs to add the matching INSERT policy on `refunds` itself.
--
-- Scope, matching the "Part 1 only" instruction:
--   - status is pinned to PENDING_APPROVAL (never PENDING_VERIFICATION) —
--     move-out/deposit refunds stay a staff-initiated flow.
--   - allocation_id / requires_deposit_clearance are pinned to NULL/false —
--     a student-submitted request is always an ordinary fee/invoice refund
--     request, never a security-deposit refund (keeps Deposit Ledger scoping
--     exactly as-is, per the project's existing rule).
--   - initiated_by must be the caller themselves (no submitting on another
--     student's behalf, enforced here — not just in the UI).
--
-- can_student_edit_finance(auth.uid(), student_id) already exists (see
-- 20260821060645_student_module_permissions.sql) and already checks
-- is_owning_student() internally, so a student passing someone else's
-- payment_id to initiateRefund still gets rejected here (the resulting row's
-- student_id would be that other student, which this student does not own).
--
-- This is a PERMISSIVE policy added alongside the existing refunds_staff_insert
-- policy (Postgres OR-combines permissive policies for the same command) —
-- the staff insert path is completely untouched.

CREATE POLICY refunds_student_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (
    public.can_student_edit_finance(auth.uid(), student_id)
    AND initiated_by = auth.uid()
    AND status = 'PENDING_APPROVAL'
    AND allocation_id IS NULL
    AND requires_deposit_clearance = false
  );
