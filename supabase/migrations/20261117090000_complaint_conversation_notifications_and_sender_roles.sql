-- =============================================================================
-- Complaint conversation: (1) message notifications, (2) verified sender roles
-- (the per-complaint "Conversation" thread = public.complaint_comments, shared by the complaint's
--  student, the assigned warden and the property admin)
--
-- 1. Sender role is decided by the DATABASE, never by the client:
--      * new nullable column complaint_comments.author_role ('STUDENT' | 'WARDEN' | 'ADMIN');
--      * a BEFORE INSERT trigger ALWAYS overwrites it from verified data (the comment's author is
--        already pinned to auth.uid() by the existing RLS WITH CHECK), so a client-supplied value is
--        ignored and cannot impersonate a role; a later UPDATE cannot change it;
--      * historical rows are left untouched (NULL). The feed view derives their role at read time
--        from the same rules, so old messages still get a badge when it can be determined and none
--        when it cannot (e.g. an accountant, or a user who no longer holds a role).
-- 2. Notifications are an AFTER INSERT trigger on complaint_comments, so they fire only for a
--    message that was really saved, whichever client/API saved it:
--      Student -> property Hostel Admin(s) + the assigned Warden
--      Warden  -> the complaint's student
--      Admin   -> the complaint's student + the assigned Warden
--    The sender is never notified. Channels: IN_APP (fn_enqueue_in_app_notification) and EMAIL
--    (fn_dispatch_notification -> send-notification Edge Function), both existing. Dedupe key =
--    comment id + recipient, so replays can never double-notify; EMAIL is only dispatched when the
--    IN_APP row was newly created. A notification failure is caught and never blocks the message.
--    Recipients must be allowed to open the conversation (can_view_complaints for staff,
--    can_student_view_complaints for the student) and must not be SUSPENDED/DISABLED; email goes
--    only to recipients with an email on file. (The schema has no per-user notification-preference
--    settings, so these existing gates are the preferences that can be respected.)
-- No data is modified or deleted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stored sender role
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaint_comments ADD COLUMN IF NOT EXISTS author_role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'complaint_comments_author_role_check' AND conrelid = 'public.complaint_comments'::regclass
  ) THEN
    ALTER TABLE public.complaint_comments
      ADD CONSTRAINT complaint_comments_author_role_check
      CHECK (author_role IS NULL OR author_role IN ('STUDENT', 'WARDEN', 'ADMIN'));
  END IF;
END $$;

-- Verified role of a user in the context of one complaint (from DB data only).
-- Precedence: the complaint's own student, then admin (Hostel Admin of the property / super admin),
-- then warden of the property. NULL = none of the three (e.g. accountant, parent, ex-staff).
CREATE OR REPLACE FUNCTION public.fn_complaint_comment_author_role(p_user_id uuid, p_complaint_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT tenant_id, property_id, student_id INTO c FROM public.complaints WHERE id = p_complaint_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.students s WHERE s.id = c.student_id AND s.profile_id = p_user_id) THEN
    RETURN 'STUDENT';
  END IF;
  IF public.is_super_admin(p_user_id) OR EXISTS (
    SELECT 1 FROM public.role_assignments ra
     WHERE ra.user_id = p_user_id AND ra.tenant_id = c.tenant_id AND ra.role = 'HOSTEL_ADMIN'::app_role
       AND ra.is_active = true AND (ra.property_id IS NULL OR ra.property_id = c.property_id)
  ) THEN
    RETURN 'ADMIN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_assignments ra
     WHERE ra.user_id = p_user_id AND ra.tenant_id = c.tenant_id AND ra.role = 'WARDEN'::app_role
       AND ra.is_active = true AND (ra.property_id IS NULL OR ra.property_id = c.property_id)
  ) THEN
    RETURN 'WARDEN';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_complaint_comment_author_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complaint_comment_author_role(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_complaint_comment_set_author_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- whatever the client sent is discarded
    NEW.author_role := public.fn_complaint_comment_author_role(NEW.author_user_id, NEW.complaint_id);
  ELSE
    NEW.author_role := OLD.author_role;   -- immutable once written
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complaint_comments_author_role ON public.complaint_comments;
CREATE TRIGGER trg_complaint_comments_author_role
  BEFORE INSERT OR UPDATE OF author_role ON public.complaint_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_comment_set_author_role();

-- Feed view: same columns as before + author_role at the end (stored value, else derived for history).
CREATE OR REPLACE VIEW public.v_complaint_comments_feed
WITH (security_invoker = true) AS
SELECT
  cm.id,
  cm.tenant_id,
  cm.property_id,
  cm.complaint_id,
  cm.author_user_id,
  cm.body,
  cm.created_at,
  (c.is_anonymous AND cm.author_user_id = s.profile_id) AS is_anonymous_author,
  CASE WHEN c.is_anonymous AND cm.author_user_id = s.profile_id THEN NULL
       ELSE p.full_name END AS author_full_name,
  COALESCE(cm.author_role, public.fn_complaint_comment_author_role(cm.author_user_id, cm.complaint_id)) AS author_role
FROM public.complaint_comments cm
JOIN public.complaints c ON c.id = cm.complaint_id
LEFT JOIN public.students s ON s.id = c.student_id
LEFT JOIN public.profiles p ON p.id = cm.author_user_id;
GRANT SELECT ON public.v_complaint_comments_feed TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notifications for a saved message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_complaint_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  v_student_user uuid;
  v_sender text;
  v_role_label text;
  v_preview text;
  r record;
  v_audience text;
  v_status text;
  v_email text;
  v_key text;
  v_new uuid;
BEGIN
  -- only the three roles in the spec have defined routing (others, e.g. accountant, notify nobody)
  IF NEW.author_role IS NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT id, tenant_id, property_id, student_id, assigned_to, complaint_number, title, is_anonymous
      INTO c FROM public.complaints WHERE id = NEW.complaint_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT s.profile_id INTO v_student_user FROM public.students s WHERE s.id = c.student_id;

    v_role_label := CASE NEW.author_role WHEN 'STUDENT' THEN 'Student' WHEN 'WARDEN' THEN 'Warden' ELSE 'Admin' END;
    SELECT p.full_name INTO v_sender FROM public.profiles p WHERE p.id = NEW.author_user_id;
    -- an anonymous complaint never reveals who its student is
    IF c.is_anonymous AND NEW.author_role = 'STUDENT' THEN v_sender := 'Anonymous student'; END IF;
    v_sender := coalesce(nullif(btrim(v_sender), ''), v_role_label);
    v_preview := left(regexp_replace(coalesce(NEW.body, ''), '\s+', ' ', 'g'), 140);
    IF length(coalesce(NEW.body, '')) > 140 THEN v_preview := v_preview || '…'; END IF;

    FOR r IN
      SELECT DISTINCT ON (u.user_id) u.user_id
        FROM (
          SELECT v_student_user AS user_id WHERE NEW.author_role IN ('WARDEN', 'ADMIN')
          UNION ALL
          SELECT c.assigned_to WHERE NEW.author_role IN ('STUDENT', 'ADMIN')
          UNION ALL
          SELECT ra.user_id FROM public.role_assignments ra
           WHERE NEW.author_role = 'STUDENT'
             AND ra.tenant_id = c.tenant_id AND ra.role = 'HOSTEL_ADMIN'::app_role AND ra.is_active = true
             AND (ra.property_id IS NULL OR ra.property_id = c.property_id)
        ) u
       WHERE u.user_id IS NOT NULL AND u.user_id <> NEW.author_user_id          -- never the sender
    LOOP
      BEGIN
        -- recipient's own verified role decides where the notification link goes
        v_audience := public.fn_complaint_comment_author_role(r.user_id, NEW.complaint_id);
        IF v_audience IS NULL THEN CONTINUE; END IF;

        SELECT p.status, p.email::text INTO v_status, v_email FROM public.profiles p WHERE p.id = r.user_id;
        IF v_status IS NULL OR v_status IN ('SUSPENDED', 'DISABLED') THEN CONTINUE; END IF;

        -- must be able to open this conversation
        IF v_audience = 'STUDENT' THEN
          IF NOT public.can_student_view_complaints(r.user_id, c.student_id) THEN CONTINUE; END IF;
        ELSIF NOT public.can_view_complaints(r.user_id, c.tenant_id, c.property_id) THEN
          CONTINUE;
        END IF;

        v_key := 'complaint_message:' || NEW.id || ':' || r.user_id;
        v_new := public.fn_enqueue_in_app_notification(
          c.tenant_id, c.property_id, r.user_id,
          'COMPLAINT_MESSAGE', 'complaint_message',
          jsonb_build_object(
            'title', v_sender || ' (' || v_role_label || ') sent a message',
            'body', c.complaint_number || ' · ' || v_preview,
            'sender_name', v_sender,
            'sender_role', v_role_label,
            'message_preview', v_preview,
            'complaint_id', c.id,
            'complaint_number', c.complaint_number,
            'complaint_title', c.title,
            'comment_id', NEW.id,
            'audience', v_audience
          ),
          v_key
        );

        -- EMAIL only for a newly created in-app row (a replay must not re-send) and only with an address on file
        IF v_new IS NOT NULL AND v_email IS NOT NULL THEN
          -- own sub-block: an email problem must not roll back the in-app notification created above
          BEGIN
            PERFORM public.fn_dispatch_notification(
              'EMAIL', 'complaint_message',
              jsonb_build_object('email', v_email),
              jsonb_build_object(
                'sender_name', v_sender, 'sender_role', v_role_label, 'message_preview', v_preview,
                'complaint_number', c.complaint_number, 'complaint_title', c.title
              ),
              'COMPLAINT_MESSAGE', c.tenant_id, c.property_id, v_key
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'complaint message email to % failed for comment %: %', r.user_id, NEW.id, SQLERRM;
          END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'complaint message notification to % failed for comment %: %', r.user_id, NEW.id, SQLERRM;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_complaint_message failed for comment %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_complaint_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaint_comments_notify ON public.complaint_comments;
-- Named to sort after trg_complaint_comments_author_role (BEFORE triggers all run first anyway).
CREATE TRIGGER trg_complaint_comments_notify
  AFTER INSERT ON public.complaint_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_complaint_message();
