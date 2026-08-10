-- ROOT CAUSE of the post-payment "activation flow" bug: activate_allocation()
-- and complete_move_out() were written in migration
-- 20260730064811_atomic_allocation_activation_and_moveout.sql and committed
-- to the repo, but were never actually applied to this live project (this
-- schema was bootstrapped via Lovable.dev's own sync, which doesn't write to
-- Supabase CLI's migration-tracking table, and this particular file's
-- content never made it into that sync). Verified directly against
-- pg_proc: neither function existed.
--
-- Effect: record_manual_payment() calling `PERFORM public.activate_allocation(...)`
-- raised "function does not exist" inside the same transaction as the
-- payment insert, so the whole payment failed and rolled back — even though
-- the client had every reason to believe the payment API call was correct.
-- Three real payments recorded through the app before this fix landed all
-- show this exact signature: invoice ended up PAID (via a differently-timed
-- partial success/retry) but allocation stuck at PENDING_PAYMENT and student
-- stuck at APPLICANT, with a payment-error surfaced to the admin.
--
-- Fix: (re-)apply the original, unmodified migration content.

CREATE OR REPLACE FUNCTION public.activate_allocation(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
  v_bed_id uuid;
BEGIN
  SELECT student_id, bed_id INTO v_student_id, v_bed_id
    FROM public.allocations
    WHERE id = p_allocation_id AND status = 'PENDING_PAYMENT'
    FOR UPDATE;

  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.allocations SET status = 'ACTIVE' WHERE id = p_allocation_id;
  UPDATE public.students SET status = 'ACTIVE' WHERE id = v_student_id;
  UPDATE public.beds SET status = 'OCCUPIED' WHERE id = v_bed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_allocation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_allocation(uuid) TO authenticated, service_role;
-- Supabase grants EXECUTE on new functions directly to `anon` by default
-- (not via PUBLIC, so REVOKE ... FROM public above doesn't touch it).
REVOKE EXECUTE ON FUNCTION public.activate_allocation(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.complete_move_out(p_allocation_id uuid, p_actual_end_date date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_property_id uuid;
  v_student_id uuid;
  v_bed_id uuid;
  v_deposit bigint;
  v_dues bigint;
  v_capped bigint;
BEGIN
  SELECT tenant_id, property_id, student_id, bed_id, COALESCE(deposit_snapshot_paise, 0)
    INTO v_tenant_id, v_property_id, v_student_id, v_bed_id, v_deposit
    FROM public.allocations
    WHERE id = p_allocation_id
    FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;

  SELECT COALESCE(SUM(balance_paise), 0) INTO v_dues
    FROM public.invoices
    WHERE allocation_id = p_allocation_id
      AND status NOT IN ('VOID', 'PAID', 'REFUNDED')
      AND deleted_at IS NULL;

  UPDATE public.allocations
    SET status = 'CLOSED', actual_end_date = p_actual_end_date, closed_at = now()
    WHERE id = p_allocation_id;

  UPDATE public.students
    SET status = 'MOVED_OUT', moved_out_at = p_actual_end_date
    WHERE id = v_student_id;

  UPDATE public.beds SET status = 'VACANT' WHERE id = v_bed_id;

  IF v_dues > 0 THEN
    v_capped := LEAST(v_dues, v_deposit);
    IF v_capped > 0 THEN
      INSERT INTO public.deposit_ledger_entries (
        tenant_id, property_id, student_id, allocation_id,
        entry_type, amount_paise, direction, reference_type, description, created_by
      ) VALUES (
        v_tenant_id, v_property_id, v_student_id, p_allocation_id,
        'DEDUCTION', v_capped, 'DEBIT', 'MOVE_OUT',
        format('Deducted outstanding dues from deposit at move-out (%s)', p_actual_end_date),
        auth.uid()
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_move_out(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_move_out(uuid, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_move_out(uuid, date) FROM anon;
