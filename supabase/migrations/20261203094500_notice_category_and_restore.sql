-- =============================================================================
-- Property Notices tab: notice categories + restoring an expired notice.
--
--   1. notices.category  - what a notice is about (Mess, Maintenance, ...). Set in the Create / Edit notice
--                          dialogs and shown as the category chip + icon in the Notices tab. Existing rows
--                          become GENERAL. The app reads it defensively: until this migration is applied,
--                          every notice is treated as GENERAL (src/lib/property-notices.ts).
--   2. fn_notices_guard_expiry() - same guard as 20261122090000 with one deliberate exception: a notice that
--                          WAS published (published_at is set) and then expired may be put back to PUBLISHED
--                          ("Restore") when its new expiry is cleared or in the future. Nothing is re-sent:
--                          restoring only makes the notice visible in feeds again. Every other rule is kept:
--                          an EXPIRED notice can never go back to DRAFT / SCHEDULED, a never-published notice
--                          cannot be revived, and nothing can be published with an expiry in the past.
--   3. fn_publish_scheduled_notices() - same as 20261122090000 with the audience scoped to the notice's property
--                          (matches publishNotice in src/lib/notice.functions.ts):
--                            * residents: current residents only (status ACTIVE / NOTICE_GIVEN);
--                            * parents: only guardians linked through student_guardians to a current resident of
--                              the property, with unlinked_at null, portal_access_enabled and can_view_notices
--                              (previously every guardian in the tenant);
--                            * staff: active role assignments for this property or tenant-wide ones (previously
--                              every warden / accountant / hostel admin in the tenant).
-- RLS is unchanged (the existing notices policies cover the new column).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Category
-- ---------------------------------------------------------------------------
ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'GENERAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notices_category_check' AND conrelid = 'public.notices'::regclass
  ) THEN
    ALTER TABLE public.notices
      ADD CONSTRAINT notices_category_check
      CHECK (category IN ('GENERAL', 'MESS', 'MAINTENANCE', 'ACADEMIC', 'FACILITIES', 'EVENT', 'EMERGENCY'));
  END IF;
END $$;

-- The Notices tab filters a property's notices by category.
CREATE INDEX IF NOT EXISTS idx_notices_property_category
  ON public.notices (property_id, category)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Expiry guard: allow restoring a previously published notice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notices_guard_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'EXPIRED'
     AND NEW.status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED') THEN
    -- Restore: only back to PUBLISHED, only if it really was published, and only with a live expiry.
    IF NOT (
      NEW.status = 'PUBLISHED'
      AND OLD.published_at IS NOT NULL
      AND (NEW.expires_at IS NULL OR NEW.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'An expired notice cannot be published again.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.status = 'PUBLISHED'
     AND NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PUBLISHED') THEN
    RAISE EXCEPTION 'A notice that has already expired cannot be published.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
-- trg_notices_guard_expiry (BEFORE INSERT OR UPDATE OF status, expires_at) already calls this function.

-- ---------------------------------------------------------------------------
-- 3. Scheduled publisher: recipients scoped to the notice's property
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
    SELECT id, tenant_id, property_id, title, body, audience_type, channels, expires_at
    FROM public.notices
    WHERE status = 'SCHEDULED'
      AND deleted_at IS NULL
      AND publish_at IS NOT NULL
      AND publish_at <= now()
    LIMIT 200
  LOOP
    -- Expiry before publication: a notice that has already expired is never published or delivered.
    -- It goes straight to EXPIRED (kept in history). Same <= rule as fn_expire_notices().
    IF n.expires_at IS NOT NULL AND n.expires_at <= now() THEN
      UPDATE public.notices SET status = 'EXPIRED' WHERE id = n.id AND status = 'SCHEDULED';
      CONTINUE;
    END IF;

    UPDATE public.notices
      SET status = 'PUBLISHED', published_at = now()
      WHERE id = n.id AND status = 'SCHEDULED';

    -- Students: current residents of this property only (moved-out / cancelled students are not told).
    IF n.audience_type IN ('ALL', 'STUDENTS') THEN
      FOR rec IN
        SELECT profile_id, phone, email
        FROM public.students
        WHERE tenant_id = n.tenant_id
          AND property_id = n.property_id
          AND deleted_at IS NULL
          AND status IN ('ACTIVE', 'NOTICE_GIVEN')
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

    -- Parents/guardians: only through a live student_guardians link to a current resident of THIS
    -- property, with portal access and notices enabled (never tenant-wide; matches publishNotice).
    IF n.audience_type IN ('ALL', 'PARENTS') THEN
      FOR rec IN
        SELECT DISTINCT g.profile_id, g.phone, g.email
        FROM public.student_guardians sg
        JOIN public.guardians g ON g.id = sg.guardian_id
        JOIN public.students s ON s.id = sg.student_id
        WHERE sg.tenant_id = n.tenant_id
          AND sg.unlinked_at IS NULL
          AND sg.portal_access_enabled = true
          AND sg.can_view_notices = true
          AND g.tenant_id = n.tenant_id
          AND g.deleted_at IS NULL
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

    -- Wardens / accountants / hostel admins of this property: active assignments scoped to it, or
    -- tenant-wide ones (property_id null). Staff of other properties are not told.
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
          AND ra.role::text = ANY(v_roles)
          AND ra.revoked_at IS NULL
          AND ra.is_active = true
          AND (ra.property_id IS NULL OR ra.property_id = n.property_id)
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
