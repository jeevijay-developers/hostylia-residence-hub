-- Notify the student when staff approve or reject one of their KYC documents.
--
-- Approve/reject are plain `documents` UPDATEs (KycApprovalQueue.tsx and
-- KycStatus.tsx, gated by the "documents warden update" / "documents admin all"
-- policies). A trigger is the one place that sees every review, so each
-- review action produces exactly one IN_APP notification for exactly one
-- recipient: the profile that owns the reviewed student row. Same shape as
-- fn_notify_admins_complaint_resolved (20260820093637).
--
-- Duplicate protection: the trigger only fires when verification_status
-- actually changes to VERIFIED/REJECTED, and the row is keyed on
-- (document, outcome, review time) against notifications_idempotency_unique,
-- so a retried or replayed statement cannot mint a second notification.
CREATE OR REPLACE FUNCTION public.fn_notify_student_kyc_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_doc_label text;
  v_title text;
  v_body text;
  v_event text;
BEGIN
  IF NEW.owner_type <> 'STUDENT' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_profile_id
  FROM public.students s
  WHERE s.id = NEW.owner_id AND s.tenant_id = NEW.tenant_id;
  -- Student has no portal login yet: nobody to notify.
  IF v_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_doc_label := replace(NEW.document_type, '_', ' ');

  IF NEW.verification_status = 'REJECTED' THEN
    v_event := 'KYC_REJECTED';
    v_title := v_doc_label || ' rejected';
    v_body := 'Reason: ' || COALESCE(NULLIF(btrim(NEW.rejection_reason), ''), 'Not specified')
      || '. Please re-upload it from My Profile.';
  ELSE
    v_event := 'KYC_APPROVED';
    v_title := v_doc_label || ' approved';
    v_body := 'Your ' || v_doc_label || ' has been verified.';
  END IF;

  INSERT INTO public.notifications (
    tenant_id, property_id, recipient_user_id, event_type, channel,
    template_key, payload, status, sent_at, delivered_at, idempotency_key
  ) VALUES (
    NEW.tenant_id, NEW.property_id, v_profile_id, v_event, 'IN_APP',
    lower(v_event),
    jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'document_id', NEW.id,
      'document_type', NEW.document_type,
      'verification_status', NEW.verification_status,
      'rejection_reason', CASE WHEN NEW.verification_status = 'REJECTED'
        THEN NEW.rejection_reason ELSE NULL END
    ),
    'DELIVERED', now(), now(),
    'kyc_review:' || NEW.id || ':' || NEW.verification_status || ':'
      || floor(extract(epoch FROM COALESCE(NEW.verified_at, now())) * 1000)::bigint
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_student_kyc_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_student_kyc_review ON public.documents;
CREATE TRIGGER trg_notify_student_kyc_review
  AFTER UPDATE OF verification_status ON public.documents
  FOR EACH ROW
  WHEN (
    OLD.verification_status IS DISTINCT FROM NEW.verification_status
    AND NEW.verification_status IN ('VERIFIED', 'REJECTED')
  )
  EXECUTE FUNCTION public.fn_notify_student_kyc_review();

-- The student KYC gate (20261029100000) hides in-app notifications from a
-- student until KYC is verified. KYC review results are about the one area
-- that stays open (My Profile / KYC), and a rejected student has to be able
-- to read why — so those two event types are readable regardless of the gate.
-- Everything else stays gated exactly as before.
DROP POLICY IF EXISTS "notifications recipient read" ON public.notifications;
CREATE POLICY "notifications recipient read" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND (
      event_type IN ('KYC_APPROVED', 'KYC_REJECTED')
      OR public.is_student_kyc_verified(auth.uid())
    )
  );
