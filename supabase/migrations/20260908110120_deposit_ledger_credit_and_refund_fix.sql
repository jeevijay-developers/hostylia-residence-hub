-- Deposit Ledger fix (PRD 6.3.12: "deposit ledger + auto-adjustment on
-- move-out"). Two gaps found in the deposit_ledger_entries flow:
--
-- 1. activate_allocation() flips an allocation to ACTIVE once the first
--    payment clears, but never recorded the deposit itself as a ledger
--    entry — only complete_move_out()'s DEBIT deduction existed. So
--    Ledger History showed nothing for a student until move-out, and
--    Current Deposit Balance (summed client-side from these rows) was
--    always 0 for anyone still resident.
-- 2. provisional_refund_paise() computed straight off
--    allocations.deposit_snapshot_paise instead of the actual ledger
--    balance, so it silently ignored any deposit_ledger_entries
--    adjustments and could disagree with the ledger's own balance.
--
-- Fix: record the deposit as a CREDIT entry when the allocation activates
-- (guarded by NOT EXISTS so a later re-invocation, or an activation that
-- raced with an earlier manual entry, can't double-credit), and make
-- provisional_refund_paise() read the real ledger balance.

CREATE OR REPLACE FUNCTION public.activate_allocation(p_allocation_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
  v_bed_id uuid;
  v_tenant_id uuid;
  v_property_id uuid;
  v_deposit bigint;
BEGIN
  SELECT student_id, bed_id, tenant_id, property_id, COALESCE(deposit_snapshot_paise, 0)
    INTO v_student_id, v_bed_id, v_tenant_id, v_property_id, v_deposit
    FROM public.allocations
    WHERE id = p_allocation_id AND status = 'PENDING_PAYMENT'
    FOR UPDATE;

  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.allocations SET status = 'ACTIVE' WHERE id = p_allocation_id;
  UPDATE public.students SET status = 'ACTIVE' WHERE id = v_student_id;
  UPDATE public.beds SET status = 'OCCUPIED' WHERE id = v_bed_id;

  IF v_deposit > 0 AND NOT EXISTS (
    SELECT 1 FROM public.deposit_ledger_entries
    WHERE allocation_id = p_allocation_id AND entry_type = 'DEPOSIT_RECEIVED'
  ) THEN
    INSERT INTO public.deposit_ledger_entries (
      tenant_id, property_id, student_id, allocation_id,
      entry_type, amount_paise, direction, reference_type, description, created_by
    ) VALUES (
      v_tenant_id, v_property_id, v_student_id, p_allocation_id,
      'DEPOSIT_RECEIVED', v_deposit, 'CREDIT', 'ALLOCATION',
      'Security deposit received at allocation activation',
      auth.uid()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_allocation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_allocation(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.activate_allocation(uuid) FROM anon;

-- Backfill: allocations activated before this fix never got a
-- DEPOSIT_RECEIVED credit, so their Ledger History/balance would stay
-- empty until move-out. One-time catch-up for anything already past
-- PENDING_PAYMENT with a nonzero deposit and no such entry yet.
INSERT INTO public.deposit_ledger_entries (
  tenant_id, property_id, student_id, allocation_id,
  entry_type, amount_paise, direction, reference_type, description
)
SELECT
  a.tenant_id, a.property_id, a.student_id, a.id,
  'DEPOSIT_RECEIVED', a.deposit_snapshot_paise, 'CREDIT', 'ALLOCATION',
  'Security deposit received at allocation activation (backfilled)'
FROM public.allocations a
WHERE COALESCE(a.deposit_snapshot_paise, 0) > 0
  AND a.status NOT IN ('PENDING_AGREEMENT', 'PENDING_PAYMENT')
  AND NOT EXISTS (
    SELECT 1 FROM public.deposit_ledger_entries dle
    WHERE dle.allocation_id = a.id AND dle.entry_type = 'DEPOSIT_RECEIVED'
  );

CREATE OR REPLACE FUNCTION public.provisional_refund_paise(p_allocation_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_balance bigint; v_dues bigint;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END), 0)
    INTO v_balance
    FROM public.deposit_ledger_entries
    WHERE allocation_id = p_allocation_id;
  SELECT COALESCE(SUM(balance_paise), 0) INTO v_dues FROM public.invoices
    WHERE allocation_id = p_allocation_id AND status NOT IN ('VOID','PAID','REFUNDED') AND deleted_at IS NULL;
  RETURN GREATEST(v_balance - v_dues, 0);
END $$;
