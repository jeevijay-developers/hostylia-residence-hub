-- =============================================================================
-- Complaint workflow fixes (no new tables / columns):
--   1. Server-side status transition validation.
--   2. Automatic RESOLVED -> CLOSED once the existing 48h reopen window (reopen_until) has elapsed.
--
-- Transition map (anything else is rejected, whoever asks and however the update arrives):
--   OPEN                -> ASSIGNED | IN_PROGRESS | RESOLVED
--   ASSIGNED            -> IN_PROGRESS | RESOLVED
--   IN_PROGRESS         -> RESOLVED
--   REOPENED            -> ASSIGNED | IN_PROGRESS | RESOLVED
--   WAITING_FOR_STUDENT -> IN_PROGRESS | RESOLVED   (legacy exits only; nothing enters this status)
--   RESOLVED            -> REOPENED (existing 48h window, enforced by fn_complaint_lifecycle)
--                          | CLOSED (system only: no end-user JWT, window elapsed)
--   CANCELLED           -> REOPENED                 (existing admin "Reopen"; nothing enters CANCELLED)
--   CLOSED              -> (terminal; cannot be reopened)
-- Who may attempt a transition is still decided by the existing RLS policies and
-- fn_complaints_guard_self_update (students: only RESOLVED -> REOPENED inside the window).
-- Historical rows are never touched by this migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_complaint_validate_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_ok := CASE OLD.status
    WHEN 'OPEN'                THEN NEW.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    WHEN 'ASSIGNED'            THEN NEW.status IN ('IN_PROGRESS', 'RESOLVED')
    WHEN 'IN_PROGRESS'         THEN NEW.status IN ('RESOLVED')
    WHEN 'REOPENED'            THEN NEW.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    WHEN 'WAITING_FOR_STUDENT' THEN NEW.status IN ('IN_PROGRESS', 'RESOLVED')
    WHEN 'RESOLVED'            THEN NEW.status IN ('REOPENED', 'CLOSED')
    WHEN 'CANCELLED'           THEN NEW.status IN ('REOPENED')
    ELSE false                                  -- CLOSED is terminal
  END;

  -- Closing is the system's job: only without an end-user session (pg_cron / service role),
  -- and only after the reopen window has really elapsed.
  IF v_ok AND OLD.status = 'RESOLVED' AND NEW.status = 'CLOSED' THEN
    v_ok := auth.uid() IS NULL
            AND OLD.reopen_until IS NOT NULL
            AND now() >= OLD.reopen_until;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid complaint status change: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complaints_status_transition ON public.complaints;
-- Named to fire after trg_complaints_guard_self_update / trg_complaints_lifecycle (alphabetical).
CREATE TRIGGER trg_complaints_status_transition
  BEFORE UPDATE OF status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_validate_status_transition();

-- ---------------------------------------------------------------------------
-- Auto-close job. Uses the existing reopen_until column (set by fn_complaint_lifecycle when a
-- complaint is resolved) and closed_at (set by the same trigger). Idempotent: a CLOSED or
-- reopened complaint no longer matches. RESOLVED rows without reopen_until are left alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_close_resolved_complaints()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.complaints
     SET status = 'CLOSED'
   WHERE status = 'RESOLVED'
     AND deleted_at IS NULL
     AND reopen_until IS NOT NULL
     AND reopen_until <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_close_resolved_complaints() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_close_resolved_complaints() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-resolved-complaints') THEN
    PERFORM cron.unschedule('close-resolved-complaints');
  END IF;
  PERFORM cron.schedule('close-resolved-complaints', '*/30 * * * *',
                        $cmd$SELECT public.fn_close_resolved_complaints();$cmd$);
END $$;
