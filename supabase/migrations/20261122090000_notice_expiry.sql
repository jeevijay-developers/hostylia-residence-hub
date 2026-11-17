-- =============================================================================
-- Notice expiry: published notices whose `expires_at` has passed become EXPIRED automatically.
--
-- notices.expires_at and the EXPIRED status already exist; nothing ever set the status. Added here, on the
-- existing pg_cron infrastructure (same pattern as publish-scheduled-notices / close-resolved-complaints):
--   1. fn_expire_notices()        - PUBLISHED -> EXPIRED when expires_at <= now(). Idempotent: it only ever
--                                   touches PUBLISHED rows, so an EXPIRED notice is never written again
--                                   (updated_at / realtime events do not repeat). DRAFT, SCHEDULED and
--                                   CANCELLED notices are never expired, whatever their expires_at.
--   2. job `expire-notices`       - every 5 minutes (the cadence of publish-scheduled-notices). Interval-based,
--                                   so it does not depend on the cron/database timezone; expires_at is a
--                                   timestamptz instant, so "when" means the same moment everywhere. The
--                                   database / server timezone is NOT changed and no timestamp is rewritten.
--   3. fn_publish_scheduled_notices() - the existing function (20260808120000, + CUSTOM audience from
--                                   20261121090000) with one change: a scheduled notice whose expiry has
--                                   already passed when its turn comes goes straight to EXPIRED and is NOT
--                                   published or delivered (expiry before publication is handled safely).
--   4. trg_notices_guard_expiry   - defence in depth: a notice that has already expired cannot be inserted
--                                   or moved to PUBLISHED, and an EXPIRED notice cannot be revived.
-- Recipient feeds already read PUBLISHED notices only (RLS), so EXPIRED notices drop out of them and stay
-- visible to staff in the composer's history. Between expires_at and the next job run the UI treats the
-- notice as expired immediately (src/lib/notice-time.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Expiry function (+ a small partial index so the 5-minute scan is a tiny lookup)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notices_expiry_due
  ON public.notices (expires_at)
  WHERE status = 'PUBLISHED' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_expire_notices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.notices
     SET status = 'EXPIRED'
   WHERE status = 'PUBLISHED'
     AND deleted_at IS NULL
     AND expires_at IS NOT NULL
     AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_expire_notices() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Guard: no publishing an already-expired notice, no reviving an EXPIRED one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notices_guard_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'EXPIRED'
     AND NEW.status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED') THEN
    RAISE EXCEPTION 'An expired notice cannot be published again.' USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'PUBLISHED'
     AND NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PUBLISHED') THEN
    RAISE EXCEPTION 'A notice that has already expired cannot be published.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notices_guard_expiry ON public.notices;
CREATE TRIGGER trg_notices_guard_expiry
  BEFORE INSERT OR UPDATE OF status, expires_at ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.fn_notices_guard_expiry();

-- ---------------------------------------------------------------------------
-- 3. Scheduled publishing: never publish / deliver a notice that has already expired
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

-- ---------------------------------------------------------------------------
-- 4. The job (one job; re-running this migration reschedules it instead of duplicating it)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-notices') THEN
    PERFORM cron.unschedule('expire-notices');
  END IF;
  PERFORM cron.schedule('expire-notices', '*/5 * * * *', $cmd$SELECT public.fn_expire_notices();$cmd$);
END $$;
