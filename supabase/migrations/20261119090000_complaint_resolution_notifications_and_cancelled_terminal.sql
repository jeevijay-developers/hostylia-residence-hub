-- =============================================================================
-- Complaint resolution: (1) submitter notification gets EMAIL + resolution status,
--                       (2) CANCELLED becomes terminal (can never be reopened)
-- No new tables, columns or triggers: both fixes replace an EXISTING function in place, so the
-- existing triggers (trg_complaints_notify_submitter_resolved, trg_complaints_status_transition)
-- keep firing exactly as before. Earlier migrations are left untouched. Nothing is modified or
-- deleted in existing data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Resolution notification to the original submitter (student, or the parent who filed it)
--    Existing behaviour kept: recipient = complaints.created_by else the student's profile; same
--    IN_APP event type / template / idempotency key (complaint + resolved_at), so a repeat of the
--    same resolution can never notify twice and notifications created before this change are
--    still recognised. Added:
--      * EMAIL through the existing fn_dispatch_notification -> send-notification path, only when
--        the IN_APP row was newly created (so a replay never re-sends) and an address is on file;
--      * `status` / `status_label` (resolution status) in the payload and the email;
--      * accounts that are SUSPENDED / DISABLED are skipped.
--    Privacy: the message goes only to the submitter and carries no student name, so an anonymous
--    complaint reveals nothing to anyone. In-app and email are isolated from each other and from the
--    resolution itself: any failure becomes a WARNING and never blocks or rolls back the resolve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_submitter_complaint_resolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_recipient uuid;
  v_audience text;
  v_status text;
  v_email text;
  v_summary text;
  v_key text;
  v_new uuid;
BEGIN
  BEGIN
    SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = NEW.student_id;
    v_recipient := coalesce(NEW.created_by, v_profile);
    IF v_recipient IS NULL THEN RETURN NEW; END IF;

    SELECT p.status, p.email::text INTO v_status, v_email FROM public.profiles p WHERE p.id = v_recipient;
    IF v_status IN ('SUSPENDED', 'DISABLED') THEN RETURN NEW; END IF;

    v_audience := CASE WHEN NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_profile
                       THEN 'PARENT' ELSE 'STUDENT' END;
    v_summary := nullif(btrim(coalesce(NEW.resolution_summary, '')), '');
    v_key := 'complaint_resolved_submitter:' || NEW.id || ':'
             || floor(extract(epoch FROM coalesce(NEW.resolved_at, now())) * 1000)::bigint;

    v_new := public.fn_enqueue_in_app_notification(
      NEW.tenant_id, NEW.property_id, v_recipient,
      'COMPLAINT_RESOLVED_SUBMITTER', 'complaint_resolved_submitter',
      jsonb_build_object(
        'title', 'Your complaint was resolved',
        'body', left(NEW.complaint_number || ' · Resolved' || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '' END, 240),
        'complaint_title', NEW.title,
        'resolution_summary', NEW.resolution_summary,
        'status', 'RESOLVED',
        'status_label', 'Resolved',
        'reopen_until', NEW.reopen_until,
        'complaint_id', NEW.id,
        'complaint_number', NEW.complaint_number,
        'audience', v_audience
      ),
      v_key
    );

    -- EMAIL: only for a newly created in-app row, only with an address on file, never blocking.
    IF v_new IS NOT NULL AND v_email IS NOT NULL THEN
      BEGIN
        PERFORM public.fn_dispatch_notification(
          'EMAIL', 'complaint_resolved_submitter',
          jsonb_build_object('email', v_email),
          jsonb_build_object(
            'complaint_number', NEW.complaint_number,
            'complaint_title', NEW.title,
            'status_label', 'Resolved',
            'resolution_summary', coalesce(v_summary, '')
          ),
          'COMPLAINT_RESOLVED_SUBMITTER', NEW.tenant_id, NEW.property_id, v_key
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'complaint resolved email failed for complaint %: %', NEW.id, SQLERRM;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_submitter_complaint_resolved failed for complaint %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_submitter_complaint_resolved() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. CANCELLED is terminal. Same function/trigger as 20261111090000 with exactly one change:
--    the `CANCELLED -> REOPENED` branch is gone, so a cancelled complaint can never change status
--    again, for any caller (staff, student, service role, direct API). The rest of the map is
--    identical:
--      OPEN -> ASSIGNED | IN_PROGRESS | RESOLVED        ASSIGNED -> IN_PROGRESS | RESOLVED
--      IN_PROGRESS -> RESOLVED                          REOPENED -> ASSIGNED | IN_PROGRESS | RESOLVED
--      WAITING_FOR_STUDENT -> IN_PROGRESS | RESOLVED    CLOSED, CANCELLED -> (terminal)
--      RESOLVED -> REOPENED (only inside the 48h window, enforced by fn_complaint_lifecycle and, for
--                  students, fn_complaints_guard_self_update) | CLOSED (system only, after the window)
--    Existing CANCELLED rows are not touched; they simply can no longer be moved.
-- ---------------------------------------------------------------------------
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
    ELSE false                                  -- CLOSED and CANCELLED are terminal
  END;

  -- Closing is the system's job: only without an end-user session (pg_cron / service role),
  -- and only after the reopen window has really elapsed.
  IF v_ok AND OLD.status = 'RESOLVED' AND NEW.status = 'CLOSED' THEN
    v_ok := auth.uid() IS NULL
            AND OLD.reopen_until IS NOT NULL
            AND now() >= OLD.reopen_until;
  END IF;

  IF NOT v_ok THEN
    IF OLD.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'A cancelled complaint cannot be reopened or changed.';
    END IF;
    RAISE EXCEPTION 'Invalid complaint status change: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
