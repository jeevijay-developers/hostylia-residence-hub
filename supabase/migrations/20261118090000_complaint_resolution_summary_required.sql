-- =============================================================================
-- Resolve Complaint: enforce the resolution-summary minimum on the BACKEND
--
-- Both Resolve flows (Admin modal, Warden status dialog) write straight to public.complaints under
-- RLS, so a client-side check alone can be bypassed by a direct API call. This trigger applies the
-- same rule as the UI (src/schemas/complaint.ts): the TRIMMED summary must be at least 3 characters.
--
--   * checked only when a complaint ENTERS RESOLVED, or when the summary of an already-RESOLVED
--     complaint is changed — so historical RESOLVED rows, ratings, auto-close (RESOLVED -> CLOSED),
--     reopen and every other update are not affected and no existing data is modified;
--   * the error text is the same friendly sentence the UI shows (no JSON / Zod output).
-- Reuses the existing complaints table and its triggers (status transitions, 48h reopen window); no
-- new tables or columns.
-- =============================================================================

-- Trims the same whitespace as JavaScript's String.prototype.trim() (btrim() alone only strips
-- spaces, so a summary of newlines/tabs would otherwise pass here but fail in the UI) and counts
-- characters, not bytes, so both sides agree.
CREATE OR REPLACE FUNCTION public.fn_complaint_require_resolution_summary()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF NEW.status = 'RESOLVED'
     AND (OLD.status IS DISTINCT FROM 'RESOLVED'
          OR NEW.resolution_summary IS DISTINCT FROM OLD.resolution_summary) THEN
    v_trimmed := regexp_replace(
      coalesce(NEW.resolution_summary, ''),
      '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$',
      '', 'g');
    IF char_length(v_trimmed) < 3 THEN
      RAISE EXCEPTION 'Please enter at least 3 characters for the resolution summary.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complaints_require_resolution_summary ON public.complaints;
CREATE TRIGGER trg_complaints_require_resolution_summary
  BEFORE UPDATE OF status, resolution_summary ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_require_resolution_summary();
