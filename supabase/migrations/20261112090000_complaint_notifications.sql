-- =============================================================================
-- Complaint notifications (reuses public.notifications + fn_enqueue_in_app_notification;
-- no new tables / columns):
--   1. New complaint        -> the property's Hostel Admin(s)
--   2. Assignment / reassign -> the newly assigned Warden
--   3. Resolution           -> the complaint's original submitter (student, or the parent who filed it)
--
-- All three are AFTER-row triggers so they fire whichever UI/API makes the change, run SECURITY
-- DEFINER (notifications has no INSERT policy for end users) and are idempotent through the
-- existing UNIQUE (tenant_id, idempotency_key). Each is wrapped so a notification problem can never
-- fail or roll back the complaint operation itself.
-- payload.complaint_id + payload.audience drive click-through routing in NotificationBell.
-- Anonymous complaints never reveal the student's name in any notification.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New complaint -> Hostel Admin(s) of that tenant + property
--    (role_assignments.property_id NULL = tenant-wide admin; otherwise must match the complaint's property)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_admins_complaint_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student text;
  v_property text;
  v_admin uuid;
BEGIN
  BEGIN
    SELECT CASE WHEN NEW.is_anonymous THEN 'Anonymous student' ELSE s.full_name END
      INTO v_student FROM public.students s WHERE s.id = NEW.student_id;
    SELECT pr.name INTO v_property FROM public.properties pr WHERE pr.id = NEW.property_id;

    FOR v_admin IN
      SELECT DISTINCT ra.user_id FROM public.role_assignments ra
       WHERE ra.tenant_id = NEW.tenant_id
         AND ra.role = 'HOSTEL_ADMIN' AND ra.is_active = true
         AND (ra.property_id IS NULL OR ra.property_id = NEW.property_id)
         AND ra.user_id IS NOT NULL
    LOOP
      PERFORM public.fn_enqueue_in_app_notification(
        NEW.tenant_id, NEW.property_id, v_admin,
        'COMPLAINT_CREATED', 'complaint_created_admin',
        jsonb_build_object(
          'title', 'New complaint',
          'body', coalesce(v_student, 'Student') || ' · ' || NEW.title || ' · ' || coalesce(v_property, ''),
          'student_name', v_student,
          'complaint_title', NEW.title,
          'property_name', v_property,
          'complaint_id', NEW.id,
          'complaint_number', NEW.complaint_number,
          'audience', 'ADMIN'
        ),
        'complaint_created:' || NEW.id || ':' || v_admin
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_admins_complaint_created failed for complaint %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_admins_complaint_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaints_notify_admin_created ON public.complaints;
CREATE TRIGGER trg_complaints_notify_admin_created
  AFTER INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_admins_complaint_created();

-- ---------------------------------------------------------------------------
-- 2. Assignment / reassignment -> the NEW assignee only.
--    Fires on INSERT (block/property auto-assign) and on UPDATE when assigned_to actually changes.
--    Skipped when the assignee is the user making the change (self-assignment). The idempotency key
--    includes assigned_at so a genuine later re-assignment to the same person notifies again, while a
--    replayed identical event cannot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_warden_complaint_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student text;
  v_room text;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  BEGIN
    SELECT CASE WHEN NEW.is_anonymous THEN 'Anonymous student' ELSE s.full_name END
      INTO v_student FROM public.students s WHERE s.id = NEW.student_id;
    SELECT r.room_number INTO v_room FROM public.rooms r WHERE r.id = NEW.room_id;

    PERFORM public.fn_enqueue_in_app_notification(
      NEW.tenant_id, NEW.property_id, NEW.assigned_to,
      'COMPLAINT_ASSIGNED', 'complaint_assigned_warden',
      jsonb_build_object(
        'title', 'Complaint assigned to you',
        'body', coalesce(v_student, 'Student')
                || CASE WHEN v_room IS NOT NULL THEN ' · Room ' || v_room ELSE '' END
                || ' · ' || NEW.title,
        'student_name', v_student,
        'room_number', v_room,
        'complaint_title', NEW.title,
        'complaint_description', left(NEW.description, 300),
        'priority', NEW.priority,
        'complaint_id', NEW.id,
        'complaint_number', NEW.complaint_number,
        'audience', 'WARDEN'
      ),
      'complaint_assigned:' || NEW.id || ':' || NEW.assigned_to || ':'
        || floor(extract(epoch FROM coalesce(NEW.assigned_at, now())) * 1000)::bigint
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_warden_complaint_assigned failed for complaint %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_warden_complaint_assigned() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaints_notify_warden_assigned_ins ON public.complaints;
CREATE TRIGGER trg_complaints_notify_warden_assigned_ins
  AFTER INSERT ON public.complaints
  FOR EACH ROW WHEN (NEW.assigned_to IS NOT NULL)
  EXECUTE FUNCTION public.fn_notify_warden_complaint_assigned();

DROP TRIGGER IF EXISTS trg_complaints_notify_warden_assigned_upd ON public.complaints;
CREATE TRIGGER trg_complaints_notify_warden_assigned_upd
  AFTER UPDATE OF assigned_to ON public.complaints
  FOR EACH ROW WHEN (NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.fn_notify_warden_complaint_assigned();

-- ---------------------------------------------------------------------------
-- 3. Resolution -> the original submitter.
--    Submitter = complaints.created_by when set (a parent filing for their child), otherwise the
--    student's own profile. The 48h reopen window (reopen_until) is untouched and is included in the
--    payload. The key uses resolved_at so a later re-resolution (after a reopen) notifies again,
--    but the same resolution can never notify twice. (The existing admin notification trigger
--    trg_complaints_notify_admin_resolved is left as is.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_submitter_complaint_resolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_recipient uuid;
  v_audience text;
BEGIN
  BEGIN
    SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = NEW.student_id;
    v_recipient := coalesce(NEW.created_by, v_profile);
    IF v_recipient IS NULL THEN RETURN NEW; END IF;
    v_audience := CASE WHEN NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_profile
                       THEN 'PARENT' ELSE 'STUDENT' END;

    PERFORM public.fn_enqueue_in_app_notification(
      NEW.tenant_id, NEW.property_id, v_recipient,
      'COMPLAINT_RESOLVED_SUBMITTER', 'complaint_resolved_submitter',
      jsonb_build_object(
        'title', 'Your complaint was resolved',
        'body', left(NEW.title || CASE WHEN nullif(trim(coalesce(NEW.resolution_summary, '')), '') IS NOT NULL
                                       THEN ': ' || NEW.resolution_summary ELSE '' END, 240),
        'complaint_title', NEW.title,
        'resolution_summary', NEW.resolution_summary,
        'reopen_until', NEW.reopen_until,
        'complaint_id', NEW.id,
        'complaint_number', NEW.complaint_number,
        'audience', v_audience
      ),
      'complaint_resolved_submitter:' || NEW.id || ':'
        || floor(extract(epoch FROM coalesce(NEW.resolved_at, now())) * 1000)::bigint
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_submitter_complaint_resolved failed for complaint %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_submitter_complaint_resolved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaints_notify_submitter_resolved ON public.complaints;
CREATE TRIGGER trg_complaints_notify_submitter_resolved
  AFTER UPDATE ON public.complaints
  FOR EACH ROW
  WHEN (NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_notify_submitter_complaint_resolved();
