-- RULES.md 19.3: allocation actions (activate, complete move-out) must be
-- atomic and go through a secure database function or Edge Function — not a
-- sequence of independent client-side updates across allocations/students/beds.
-- RULES.md 19.5: bed.status must never move independently of allocation state.

-- Called once a student's first payment on an allocation clears (Razorpay
-- webhook or manual/cash payment recording). No-ops if the allocation isn't
-- sitting in PENDING_PAYMENT, so re-invoking on a later rent payment is safe.
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

-- Closes an allocation, moves the student out, frees the bed, and (matching
-- the previous TS implementation) deducts any outstanding invoice dues from
-- the deposit via a ledger entry. auth.uid() supplies created_by — works
-- under SECURITY DEFINER since it reads the caller's JWT claim, not the
-- function owner's identity.
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
