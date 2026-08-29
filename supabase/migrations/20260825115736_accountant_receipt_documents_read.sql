-- Fix: Accountant → Payment History → Download Receipt always showed
-- "Receipt not generated yet", even for payments whose receipt had
-- genuinely been generated (a real `documents` row with
-- owner_type='RECEIPT', status='AVAILABLE' already exists — confirmed live
-- for several recent payments).
--
-- Root cause: `useReceiptDownload()` (PaymentHistoryPanel.tsx) reads the
-- receipt via a direct `supabase.from("documents").select(...)` call from
-- the browser, which is RLS-bound. The `documents` table has SELECT
-- policies for HOSTEL_ADMIN ("documents admin all"), WARDEN
-- ("documents warden read"), the student themselves, and parents — but
-- none at all for ACCOUNTANT. So the query silently returned zero rows
-- (not an error) for every Accountant, regardless of whether the receipt
-- existed, and the code correctly (but misleadingly) reported "Receipt
-- not generated yet".
--
-- Fix: add a narrowly-scoped SELECT policy — only RECEIPT-type documents,
-- only where the caller already has payments_view for that property,
-- reusing the existing can_view_payments() helper (same one payments'
-- own RLS policy already uses) rather than introducing new permission
-- logic. Does not touch any other document type (KYC, agreements, etc.)
-- or expand Accountant access anywhere else.
CREATE POLICY "documents accountant receipt read" ON public.documents FOR SELECT TO authenticated
  USING (
    owner_type = 'RECEIPT'
    AND property_id IS NOT NULL
    AND public.can_view_payments(auth.uid(), tenant_id, property_id)
  );
