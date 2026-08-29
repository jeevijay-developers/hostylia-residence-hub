-- Bound retry eligibility by age: a notification whose content is time-sensitive
-- (fee reminders, gate events) becomes misleading if retried days after the
-- fact (e.g. an invoice reminder retried after the invoice was already paid).
-- Cap retries to notifications created within the last 48 hours; anything
-- older that's still FAILED is left alone (visible via notification_attempts
-- for manual/audit review) rather than resent with stale context.
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
  MAX_AGE constant interval := interval '48 hours';
BEGIN
  FOR n IN
    SELECT id
    FROM public.notifications
    WHERE status = 'FAILED'
      AND channel <> 'IN_APP'
      AND scheduled_for <= now()
      AND created_at >= now() - MAX_AGE
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
  'Scans FAILED SMS/WhatsApp/Email notifications created within the last 48 hours whose backoff window (scheduled_for) has elapsed and retries each (up to 5 attempts total) via fn_retry_notification. Older FAILED rows are left alone to avoid resending stale time-sensitive content. Scheduled every 10 minutes by pg_cron.';
