-- Async email/SMS/WhatsApp retry worker.
-- Reuses the existing net.http_post -> send-notification pattern already
-- proven by fn_dispatch_notification (called from fn_send_fee_reminders /
-- fn_scan_complaint_sla_breaches). send-notification now supports a
-- { notificationId } retry-mode branch (deployed separately) that re-attempts
-- delivery for an existing notifications row without recomputing its
-- idempotency key, so retries never create duplicate notification rows.

CREATE OR REPLACE FUNCTION public.fn_retry_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://umznrrdqduynifpatslb.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_vDuiCkZ6_69swy9eH9hk5Q_J8evIefy'
    ),
    body := jsonb_build_object('notificationId', p_notification_id::text)
  );
END
$function$;

COMMENT ON FUNCTION public.fn_retry_notification(uuid) IS
  'Re-dispatches one existing FAILED notification via the send-notification edge function retry-mode branch. Never blocks the caller (net.http_post is async).';

CREATE OR REPLACE FUNCTION public.fn_retry_failed_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n record;
  v_count int := 0;
  v_attempts int;
  MAX_ATTEMPTS constant int := 5;
BEGIN
  FOR n IN
    SELECT id
    FROM public.notifications
    WHERE status = 'FAILED'
      AND channel <> 'IN_APP'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT 200
  LOOP
    SELECT count(*) INTO v_attempts
    FROM public.notification_attempts
    WHERE notification_id = n.id;

    IF v_attempts >= MAX_ATTEMPTS THEN
      CONTINUE; -- exhausted; leave as permanently FAILED for manual/audit review
    END IF;

    PERFORM public.fn_retry_notification(n.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END
$function$;

COMMENT ON FUNCTION public.fn_retry_failed_notifications() IS
  'Scans FAILED SMS/WhatsApp/Email notifications whose backoff window (scheduled_for) has elapsed and retries each (up to 5 attempts total) via fn_retry_notification. Scheduled every 10 minutes by pg_cron.';

SELECT cron.schedule(
  'retry-failed-notifications',
  '*/10 * * * *',
  $$SELECT public.fn_retry_failed_notifications();$$
);
