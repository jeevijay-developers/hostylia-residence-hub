-- Root cause: `allocations` has RLS policies for admin/warden/accountant and
-- a student *read* policy, but no student *write* policy at all. When a
-- student signs their own agreement, acceptAgreementClickwrap's follow-up
-- `supabase.from("allocations").update({status:"PENDING_PAYMENT"})` runs on
-- the student's own session and is silently blocked by RLS (0 rows
-- affected, no error — the code never checked). The allocation stays stuck
-- at PENDING_AGREEMENT forever, and since generateFirstInvoiceForAllocation
-- is only useful once the allocation is actually progressing, no invoice
-- ever gets generated either — even though the agreement genuinely shows
-- "Completed — signed".
--
-- Fix: a narrow SECURITY DEFINER function, mirroring the existing
-- activate_allocation()/complete_move_out() pattern (RULES.md 19.3) — it
-- only allows the one transition PENDING_AGREEMENT -> PENDING_PAYMENT, and
-- only when the linked agreement is already SIGNED (a state itself only
-- reachable through the properly RLS-gated "agreements student sign"
-- policy). No new business rule: this is the exact transition the code
-- already intended, just made to actually happen.
CREATE OR REPLACE FUNCTION public.advance_allocation_after_signing(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alloc_id uuid;
BEGIN
  SELECT allocation_id INTO v_alloc_id
    FROM public.agreements
    WHERE id = p_agreement_id AND status = 'SIGNED';

  IF v_alloc_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.allocations
    SET status = 'PENDING_PAYMENT'
    WHERE id = v_alloc_id AND status = 'PENDING_AGREEMENT';
END;
$$;

REVOKE ALL ON FUNCTION public.advance_allocation_after_signing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_allocation_after_signing(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_allocation_after_signing(uuid) FROM anon;
