-- Scheduled notices (notices.status = 'SCHEDULED', publish_at in the future)
-- were never actually published — publishNotice() (src/lib/notice.functions.ts)
-- only inserts the row with a future publish_at and returns; nothing ever
-- flips it to PUBLISHED or dispatches the fan-out. Fix follows the same
-- pattern already used for fn_scan_complaint_sla_breaches / fn_send_fee_reminders:
-- a SECURITY DEFINER function polled by pg_cron, using fn_enqueue_in_app_notification
-- for IN_APP and fn_dispatch_notification (pg_net -> send-notification Edge Fn)
-- for SMS/WHATSAPP/EMAIL.

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

-- Poll every 5 minutes — a notice scheduled for a specific minute publishing
-- up to ~5 minutes late is acceptable, matching the SLA-scan cadence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-notices') THEN
    PERFORM cron.unschedule('publish-scheduled-notices');
  END IF;
  PERFORM cron.schedule('publish-scheduled-notices', '*/5 * * * *', $cmd$SELECT public.fn_publish_scheduled_notices();$cmd$);
END $$;
