-- Shared Admin/Warden KYC document review workflow.
--
-- Today both KycApprovalQueueCard (Admin dashboard + Warden daily brief)
-- and KycStatus's canReview rows (Admin student detail) write directly to
-- documents.verification_status/verified_by/verified_at/rejection_reason
-- from the browser. Two problems with that:
--   1. No row lock — two reviewers racing the same document can both
--      "succeed" from the client's point of view, the second silently
--      overwriting the first's decision.
--   2. No history — verified_by is a bare auth.uid() with no record of
--      which role (ADMIN vs WARDEN) made the call, and a second write
--      erases the first reviewer's identity entirely.
--
-- This migration adds a document_reviews history table (one permanent row
-- per decision, written once) and an atomic SECURITY DEFINER RPC that both
-- UI surfaces are switched to call instead of updating `documents` directly.
-- RLS on `documents` (documents admin all / documents warden update) is
-- intentionally left untouched — this RPC is an additional server-side
-- gate layered on top, not a replacement for it; a caller still can't even
-- reach this function's row lock unless they're already a tenant Admin or
-- a Warden scoped to the document's property.

-- ---------------------------------------------------------------------------
-- 1. Review history table
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('HOSTEL_ADMIN', 'WARDEN')),
  action text NOT NULL CHECK (action IN ('VERIFIED', 'REJECTED')),
  rejection_reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one permanent decision per document — fn_decide_kyc_document's
  -- own PENDING-status guard (under a row lock) is what actually prevents a
  -- second decision from being attempted, but this constraint backstops it
  -- at the data level against a direct, non-RPC insert that only an
  -- already-authorized service-role/administrative action could perform.
  CONSTRAINT uniq_document_reviews_document UNIQUE (document_id)
);
CREATE INDEX idx_document_reviews_document ON public.document_reviews(document_id);
GRANT SELECT ON public.document_reviews TO authenticated;
GRANT ALL ON public.document_reviews TO service_role;
ALTER TABLE public.document_reviews ENABLE ROW LEVEL SECURITY;

-- Read scope mirrors who can already read the parent document row today
-- (documents admin all / documents warden read) — no new access surface.
CREATE POLICY document_reviews_staff_read ON public.document_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_reviews.document_id
      AND (
        public.has_tenant_role(auth.uid(), d.tenant_id, 'HOSTEL_ADMIN')
        OR (d.property_id IS NOT NULL AND public.warden_can_read_property(auth.uid(), d.tenant_id, d.property_id))
      )
  ));
-- No INSERT/UPDATE/DELETE policy for `authenticated` — every write to this
-- table must go through fn_decide_kyc_document below (SECURITY DEFINER,
-- bypasses RLS for its own write) or the service role directly.

-- ---------------------------------------------------------------------------
-- 2. Atomic decide RPC — row-locked, PENDING-gated, writes documents +
--    document_reviews together, determines the caller's role itself
--    (never trusts a client-supplied role string).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_decide_kyc_document(
  p_document_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS public.documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.documents;
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_decision NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'p_decision must be VERIFIED or REJECTED';
  END IF;
  IF p_decision = 'REJECTED' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'A reason is required to reject a document';
  END IF;

  -- Row lock serializes two reviewers racing the same document: the second
  -- caller's SELECT ... FOR UPDATE blocks until the first transaction
  -- commits, then re-reads the now-updated status below and is rejected by
  -- the PENDING check — it never overwrites the first decision.
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id FOR UPDATE;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF v_doc.owner_type IS DISTINCT FROM 'STUDENT' THEN
    RAISE EXCEPTION 'Only student KYC documents can be reviewed through this function';
  END IF;

  -- Determine the caller's authorized acting role server-side — mirrors the
  -- exact same checks "documents admin all" / "documents warden update"
  -- already use, so authorization here never drifts from what RLS permits.
  IF public.has_tenant_role(v_uid, v_doc.tenant_id, 'HOSTEL_ADMIN') THEN
    v_role := 'HOSTEL_ADMIN';
  ELSIF v_doc.property_id IS NOT NULL
        AND public.warden_can_write_scope(v_uid, v_doc.tenant_id, v_doc.property_id, NULL) THEN
    v_role := 'WARDEN';
  ELSE
    RAISE EXCEPTION 'Not authorized to review this document';
  END IF;

  IF v_doc.verification_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'This document has already been reviewed'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.documents SET
    verification_status = p_decision,
    verified_by = v_uid,
    verified_at = now(),
    rejection_reason = CASE WHEN p_decision = 'REJECTED' THEN btrim(p_rejection_reason) ELSE NULL END
  WHERE id = p_document_id
  RETURNING * INTO v_doc;

  INSERT INTO public.document_reviews (
    document_id, reviewer_id, reviewer_role, action, rejection_reason, decided_at
  ) VALUES (
    p_document_id, v_uid, v_role, p_decision,
    CASE WHEN p_decision = 'REJECTED' THEN btrim(p_rejection_reason) ELSE NULL END,
    v_doc.verified_at
  );

  RETURN v_doc;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_decide_kyc_document(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_decide_kyc_document(uuid, text, text) TO authenticated;
