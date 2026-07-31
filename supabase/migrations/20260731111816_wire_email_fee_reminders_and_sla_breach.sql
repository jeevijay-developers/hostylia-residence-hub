-- Wire EMAIL channel into the fee-reminder and complaint-SLA-breach scheduled
-- functions. Both previously only enqueued IN_APP rows directly; they now also
-- fire an async pg_net call to the send-notification Edge Function (which owns
-- the actual Resend integration) whenever a recipient has an email on file.
--
-- Auth for the pg_net call: send-notification has verify_jwt=true, which only
-- requires *any* validly-signed project JWT, not specifically service_role.
-- We use the anon/publishable key here deliberately, since it's already public
-- (shipped in the browser bundle) and safe to commit — no secret handling
-- needed for a pure server-to-server trigger call like this.

CREATE OR REPLACE FUNCTION public.fn_dispatch_notification(
  p_channel TEXT,
  p_template_key TEXT,
  p_recipient JSONB,
  p_variables JSONB,
  p_event_type TEXT,
  p_tenant_id UUID,
  p_property_id UUID,
  p_reference_id TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://umznrrdqduynifpatslb.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_vDuiCkZ6_69swy9eH9hk5Q_J8evIefy'
    ),
    body := jsonb_build_object(
      'channel', p_channel,
      'templateKey', p_template_key,
      'recipient', p_recipient,
      'variables', COALESCE(p_variables, '{}'::jsonb),
      'eventType', p_event_type,
      'tenantId', p_tenant_id,
      'propertyId', p_property_id,
      'referenceId', p_reference_id
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_dispatch_notification FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dispatch_notification FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dispatch_notification FROM anon;

-- =========== Complaint SLA breach scanner — add EMAIL to warden + admins ===========
CREATE OR REPLACE FUNCTION public.fn_scan_complaint_sla_breaches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_count int := 0;
  v_admin record;
  v_key TEXT;
  v_warden_email TEXT;
BEGIN
  FOR r IN
    SELECT id, tenant_id, property_id, complaint_number, sla_due_at, assigned_to
    FROM public.complaints
    WHERE deleted_at IS NULL AND sla_breached_at IS NULL
      AND status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND sla_due_at < now()
    LIMIT 500
  LOOP
    UPDATE public.complaints SET sla_breached_at = now(), updated_at = now()
      WHERE id = r.id AND sla_breached_at IS NULL;

    INSERT INTO public.audit_logs (tenant_id, property_id, action, entity_type, entity_id, after_data)
    VALUES (r.tenant_id, r.property_id, 'SLA_BREACH', 'complaints', r.id,
            jsonb_build_object('complaint_number', r.complaint_number, 'sla_due_at', r.sla_due_at));

    -- Notify assigned warden (IN_APP + EMAIL)
    IF r.assigned_to IS NOT NULL THEN
      v_key := 'sla:' || r.id::text || ':warden';
      PERFORM public.fn_enqueue_in_app_notification(
        r.tenant_id, r.property_id, r.assigned_to,
        'COMPLAINT_SLA_BREACH', 'complaint_sla_breach_warden',
        jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
        v_key
      );
      SELECT email INTO v_warden_email FROM public.profiles WHERE id = r.assigned_to;
      IF v_warden_email IS NOT NULL THEN
        PERFORM public.fn_dispatch_notification(
          'EMAIL', 'complaint_sla_breach_warden',
          jsonb_build_object('email', v_warden_email),
          jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
          'COMPLAINT_SLA_BREACH', r.tenant_id, r.property_id, v_key
        );
      END IF;
    END IF;

    -- Notify all HOSTEL_ADMIN in that property (IN_APP + EMAIL)
    FOR v_admin IN
      SELECT DISTINCT ra.user_id, p.email
      FROM public.role_assignments ra
      JOIN public.profiles p ON p.id = ra.user_id
      WHERE ra.tenant_id = r.tenant_id AND ra.role = 'HOSTEL_ADMIN'
        AND (ra.property_id IS NULL OR ra.property_id = r.property_id)
        AND (ra.revoked_at IS NULL)
    LOOP
      v_key := 'sla:' || r.id::text || ':admin:' || v_admin.user_id::text;
      PERFORM public.fn_enqueue_in_app_notification(
        r.tenant_id, r.property_id, v_admin.user_id,
        'COMPLAINT_SLA_BREACH', 'complaint_sla_breach_admin',
        jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
        v_key
      );
      IF v_admin.email IS NOT NULL THEN
        PERFORM public.fn_dispatch_notification(
          'EMAIL', 'complaint_sla_breach_admin',
          jsonb_build_object('email', v_admin.email),
          jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
          'COMPLAINT_SLA_BREACH', r.tenant_id, r.property_id, v_key
        );
      END IF;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- =========== Fee reminder scheduled function — add EMAIL to student + parents ===========
CREATE OR REPLACE FUNCTION public.fn_send_fee_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record;
  guardian record;
  v_count int := 0;
  v_days_diff int;
  v_stage TEXT;
  v_key TEXT;
BEGIN
  FOR inv IN
    SELECT i.id, i.tenant_id, i.property_id, i.student_id, i.invoice_number,
           i.due_date, i.balance_paise, s.profile_id AS student_profile_id, s.email AS student_email
    FROM public.invoices i
    JOIN public.students s ON s.id = i.student_id
    WHERE i.deleted_at IS NULL
      AND i.status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')
      AND i.balance_paise > 0
      AND i.due_date BETWEEN (current_date - INTERVAL '7 days') AND (current_date + INTERVAL '3 days')
  LOOP
    v_days_diff := (current_date - inv.due_date);
    v_stage := CASE
      WHEN v_days_diff = -3 THEN 'T-3'
      WHEN v_days_diff = 0  THEN 'DUE'
      WHEN v_days_diff = 3  THEN 'T+3'
      WHEN v_days_diff = 7  THEN 'T+7'
      ELSE NULL
    END;
    IF v_stage IS NULL THEN CONTINUE; END IF;

    -- Student
    IF inv.student_profile_id IS NOT NULL THEN
      v_key := 'fee:' || inv.id::text || ':student:' || v_stage;
      PERFORM public.fn_enqueue_in_app_notification(
        inv.tenant_id, inv.property_id, inv.student_profile_id,
        'FEE_REMINDER', 'fee_reminder_student',
        jsonb_build_object(
          'invoice_id', inv.id, 'invoice_number', inv.invoice_number,
          'balance_paise', inv.balance_paise, 'due_date', inv.due_date, 'stage', v_stage
        ),
        v_key
      );
      v_count := v_count + 1;
    END IF;
    IF inv.student_email IS NOT NULL THEN
      PERFORM public.fn_dispatch_notification(
        'EMAIL', 'fee_reminder_student',
        jsonb_build_object('email', inv.student_email),
        jsonb_build_object(
          'invoice_number', inv.invoice_number, 'balance_paise', inv.balance_paise,
          'due_date', inv.due_date, 'stage', v_stage
        ),
        'FEE_REMINDER', inv.tenant_id, inv.property_id,
        'fee:' || inv.id::text || ':student-email:' || v_stage
      );
    END IF;

    -- Parents (with can_pay_fees) — IN_APP requires a linked profile, EMAIL doesn't
    FOR guardian IN
      SELECT g.profile_id AS uid, g.email AS email
      FROM public.student_guardians sg
      JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = inv.student_id
        AND sg.unlinked_at IS NULL
        AND sg.can_pay_fees = true
        AND (g.profile_id IS NOT NULL OR g.email IS NOT NULL)
    LOOP
      IF guardian.uid IS NOT NULL THEN
        v_key := 'fee:' || inv.id::text || ':parent:' || guardian.uid::text || ':' || v_stage;
        PERFORM public.fn_enqueue_in_app_notification(
          inv.tenant_id, inv.property_id, guardian.uid,
          'FEE_REMINDER', 'fee_reminder_parent',
          jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number,
            'balance_paise', inv.balance_paise, 'due_date', inv.due_date, 'stage', v_stage
          ),
          v_key
        );
        v_count := v_count + 1;
      END IF;
      IF guardian.email IS NOT NULL THEN
        PERFORM public.fn_dispatch_notification(
          'EMAIL', 'fee_reminder_parent',
          jsonb_build_object('email', guardian.email),
          jsonb_build_object(
            'invoice_number', inv.invoice_number, 'balance_paise', inv.balance_paise,
            'due_date', inv.due_date, 'stage', v_stage
          ),
          'FEE_REMINDER', inv.tenant_id, inv.property_id,
          'fee:' || inv.id::text || ':parent-email:' || COALESCE(guardian.uid::text, guardian.email) || ':' || v_stage
        );
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END $$;

-- Complaint SLA breach scanner was never actually scheduled (only fee reminders
-- and invoice generation were). Add it — every 15 minutes, since SLA breaches
-- are time-sensitive in a way daily batching isn't appropriate for.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complaint-sla-scan') THEN
    PERFORM cron.unschedule('complaint-sla-scan');
  END IF;
  PERFORM cron.schedule('complaint-sla-scan', '*/15 * * * *', $cmd$SELECT public.fn_scan_complaint_sla_breaches();$cmd$);
END $$;
