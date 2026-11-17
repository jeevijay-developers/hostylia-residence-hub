-- =============================================================================
-- Notice Composer: Custom audience (notices.audience_type = 'CUSTOM' already exists in the schema).
--
-- What was missing: nowhere to keep WHICH students a custom notice targets, so a scheduled CUSTOM notice
-- would be published to nobody (fn_publish_scheduled_notices only knew ALL / STUDENTS / PARENTS /
-- WARDENS / ACCOUNTANTS). Two additions, nothing else changes:
--   1. notice_recipients  - the resolved, de-duplicated student list of a CUSTOM notice (blocks are
--                           expanded to students by the server when the notice is created).
--                           A separate table, not a column on notices: notices are readable by every
--                           tenant member once published, and the recipient list must not be.
--   2. fn_publish_scheduled_notices() - same function, one new CUSTOM branch that notifies exactly
--                           those students (re-checked for eligibility at send time), through the same
--                           fn_enqueue_in_app_notification / fn_dispatch_notification calls and the
--                           same idempotency keys as every other audience.
-- Existing data and existing audiences are untouched. Eligible = a current resident of the notice's
-- property: students.status IN ('ACTIVE','NOTICE_GIVEN') and not deleted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. notice_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notice_recipients (
  notice_id   uuid NOT NULL REFERENCES public.notices(id)    ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id)   ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_recipients_student ON public.notice_recipients(student_id);

ALTER TABLE public.notice_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_recipients FORCE ROW LEVEL SECURITY;
-- Append-only for end users: no UPDATE / DELETE grant (rows go away with their notice).
GRANT SELECT, INSERT ON public.notice_recipients TO authenticated;
GRANT ALL ON public.notice_recipients TO service_role;

-- Same people who may create notices (can_manage_notices, as in the notices policies). Students and
-- parents have no access, even to the list of a notice they can read.
DROP POLICY IF EXISTS "notice recipients staff read" ON public.notice_recipients;
CREATE POLICY "notice recipients staff read" ON public.notice_recipients
  FOR SELECT TO authenticated
  USING (public.can_manage_notices(auth.uid(), tenant_id, property_id));

DROP POLICY IF EXISTS "notice recipients staff insert" ON public.notice_recipients;
CREATE POLICY "notice recipients staff insert" ON public.notice_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_notices(auth.uid(), tenant_id, property_id)
    AND EXISTS (SELECT 1 FROM public.notices n WHERE n.id = notice_id AND n.created_by = auth.uid())
  );

-- Database-side validation of every recipient, whoever inserts it: the notice must be a CUSTOM notice,
-- the row must carry the notice's own tenant/property, and the student must belong to that tenant and
-- property and be an eligible (current, not deleted) resident. Cross-tenant / cross-property students
-- can therefore never be attached to a notice, even by a client that skipped the server checks.
CREATE OR REPLACE FUNCTION public.fn_notice_recipients_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n record;
  s record;
BEGIN
  SELECT tenant_id, property_id, audience_type, status INTO n FROM public.notices WHERE id = NEW.notice_id;
  IF NOT FOUND OR n.audience_type <> 'CUSTOM' THEN
    RAISE EXCEPTION 'Recipients can only be attached to a custom-audience notice.' USING ERRCODE = '22023';
  END IF;
  IF NEW.tenant_id <> n.tenant_id OR NEW.property_id <> n.property_id THEN
    RAISE EXCEPTION 'Recipient scope must match the notice.' USING ERRCODE = '42501';
  END IF;
  SELECT tenant_id, property_id, status, deleted_at INTO s FROM public.students WHERE id = NEW.student_id;
  IF NOT FOUND
     OR s.tenant_id <> n.tenant_id OR s.property_id <> n.property_id
     OR s.deleted_at IS NOT NULL OR s.status NOT IN ('ACTIVE', 'NOTICE_GIVEN') THEN
    RAISE EXCEPTION 'Student is not an eligible recipient for this notice.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_notice_recipients_validate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notice_recipients_validate ON public.notice_recipients;
CREATE TRIGGER trg_notice_recipients_validate
  BEFORE INSERT ON public.notice_recipients
  FOR EACH ROW EXECUTE FUNCTION public.fn_notice_recipients_validate();

-- ---------------------------------------------------------------------------
-- 2. Scheduled publishing: the existing function (20260808120000) plus a CUSTOM branch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_publish_scheduled_notices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n record;
  rec record;
  v_count int := 0;
  v_roles TEXT[];
BEGIN
  FOR n IN
    SELECT id, tenant_id, property_id, title, body, audience_type, channels
    FROM public.notices
    WHERE status = 'SCHEDULED'
      AND deleted_at IS NULL
      AND publish_at IS NOT NULL
      AND publish_at <= now()
    LIMIT 200
  LOOP
    UPDATE public.notices
      SET status = 'PUBLISHED', published_at = now()
      WHERE id = n.id AND status = 'SCHEDULED';

    -- Students
    IF n.audience_type IN ('ALL', 'STUDENTS') THEN
      FOR rec IN
        SELECT profile_id, phone, email
        FROM public.students
        WHERE property_id = n.property_id AND deleted_at IS NULL
      LOOP
        IF rec.profile_id IS NOT NULL THEN
          PERFORM public.fn_enqueue_in_app_notification(
            n.tenant_id, n.property_id, rec.profile_id,
            'NOTICE_BROADCAST', 'notice_broadcast',
            jsonb_build_object('title', n.title, 'body', n.body),
            'notice:' || n.id::text || ':' || rec.profile_id::text
          );
        END IF;
        IF 'SMS' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('SMS', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':sms:' || rec.phone);
        END IF;
        IF 'WHATSAPP' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('WHATSAPP', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':wa:' || rec.phone);
        END IF;
        IF 'EMAIL' = ANY(n.channels) AND rec.email IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('EMAIL', 'notice_broadcast',
            jsonb_build_object('email', rec.email),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':email:' || rec.email);
        END IF;
      END LOOP;
    END IF;

    -- Custom audience: the students snapshotted into notice_recipients when the notice was created,
    -- re-checked now (same property, not deleted, still a current resident). One row per student
    -- (primary key), so a student chosen individually and through a block is notified once.
    IF n.audience_type = 'CUSTOM' THEN
      FOR rec IN
        SELECT s.profile_id, s.phone, s.email
        FROM public.notice_recipients nr
        JOIN public.students s ON s.id = nr.student_id
        WHERE nr.notice_id = n.id
          AND s.tenant_id = n.tenant_id
          AND s.property_id = n.property_id
          AND s.deleted_at IS NULL
          AND s.status IN ('ACTIVE', 'NOTICE_GIVEN')
      LOOP
        IF rec.profile_id IS NOT NULL THEN
          PERFORM public.fn_enqueue_in_app_notification(
            n.tenant_id, n.property_id, rec.profile_id,
            'NOTICE_BROADCAST', 'notice_broadcast',
            jsonb_build_object('title', n.title, 'body', n.body),
            'notice:' || n.id::text || ':' || rec.profile_id::text
          );
        END IF;
        IF 'SMS' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('SMS', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':sms:' || rec.phone);
        END IF;
        IF 'WHATSAPP' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('WHATSAPP', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':wa:' || rec.phone);
        END IF;
        IF 'EMAIL' = ANY(n.channels) AND rec.email IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('EMAIL', 'notice_broadcast',
            jsonb_build_object('email', rec.email),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':email:' || rec.email);
        END IF;
      END LOOP;
    END IF;

    -- Parents/guardians (tenant-wide, matches publishNotice's own scoping)
    IF n.audience_type IN ('ALL', 'PARENTS') THEN
      FOR rec IN
        SELECT profile_id, phone, email
        FROM public.guardians
        WHERE tenant_id = n.tenant_id
      LOOP
        IF rec.profile_id IS NOT NULL THEN
          PERFORM public.fn_enqueue_in_app_notification(
            n.tenant_id, n.property_id, rec.profile_id,
            'NOTICE_BROADCAST', 'notice_broadcast',
            jsonb_build_object('title', n.title, 'body', n.body),
            'notice:' || n.id::text || ':' || rec.profile_id::text
          );
        END IF;
        IF 'SMS' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('SMS', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':sms:' || rec.phone);
        END IF;
        IF 'WHATSAPP' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('WHATSAPP', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':wa:' || rec.phone);
        END IF;
        IF 'EMAIL' = ANY(n.channels) AND rec.email IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('EMAIL', 'notice_broadcast',
            jsonb_build_object('email', rec.email),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':email:' || rec.email);
        END IF;
      END LOOP;
    END IF;

    -- Wardens / accountants / hostel admins
    IF n.audience_type IN ('ALL', 'WARDENS', 'ACCOUNTANTS') THEN
      v_roles := CASE n.audience_type
        WHEN 'WARDENS' THEN ARRAY['WARDEN']
        WHEN 'ACCOUNTANTS' THEN ARRAY['ACCOUNTANT']
        ELSE ARRAY['WARDEN', 'ACCOUNTANT', 'HOSTEL_ADMIN']
      END;
      FOR rec IN
        SELECT DISTINCT p.id AS profile_id, p.phone, p.email
        FROM public.role_assignments ra
        JOIN public.profiles p ON p.id = ra.user_id
        WHERE ra.tenant_id = n.tenant_id
          AND ra.role = ANY(v_roles)
          AND ra.revoked_at IS NULL
      LOOP
        PERFORM public.fn_enqueue_in_app_notification(
          n.tenant_id, n.property_id, rec.profile_id,
          'NOTICE_BROADCAST', 'notice_broadcast',
          jsonb_build_object('title', n.title, 'body', n.body),
          'notice:' || n.id::text || ':' || rec.profile_id::text
        );
        IF 'SMS' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('SMS', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':sms:' || rec.phone);
        END IF;
        IF 'WHATSAPP' = ANY(n.channels) AND rec.phone IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('WHATSAPP', 'notice_broadcast',
            jsonb_build_object('phone', rec.phone),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':wa:' || rec.phone);
        END IF;
        IF 'EMAIL' = ANY(n.channels) AND rec.email IS NOT NULL THEN
          PERFORM public.fn_dispatch_notification('EMAIL', 'notice_broadcast',
            jsonb_build_object('email', rec.email),
            jsonb_build_object('title', n.title, 'body', n.body),
            'NOTICE_BROADCAST', n.tenant_id, n.property_id,
            'notice:' || n.id::text || ':email:' || rec.email);
        END IF;
      END LOOP;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_publish_scheduled_notices FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_publish_scheduled_notices FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_publish_scheduled_notices FROM anon;
