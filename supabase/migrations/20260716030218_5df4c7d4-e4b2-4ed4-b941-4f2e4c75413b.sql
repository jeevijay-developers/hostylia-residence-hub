
-- =========================
-- Phase 10 — Notifications
-- =========================

CREATE TABLE public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','IMPORTANT','URGENT')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SCHEDULED','PUBLISHED','EXPIRED','CANCELLED')),
  audience_type TEXT NOT NULL DEFAULT 'ALL' CHECK (audience_type IN ('ALL','STUDENTS','PARENTS','WARDENS','ACCOUNTANTS','CUSTOM')),
  channels TEXT[] NOT NULL DEFAULT ARRAY['IN_APP'],
  publish_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_notices_property_status ON public.notices(property_id, status);
CREATE INDEX idx_notices_published_at ON public.notices(published_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_notices_updated BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read: any authenticated user in the property's tenant scope can read PUBLISHED notices
CREATE POLICY "notices read published in tenant" ON public.notices
  FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = notices.tenant_id
    )
  );

-- Read drafts/scheduled: author or hostel-admin for that property
CREATE POLICY "notices author or admin manage" ON public.notices
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL)
  );

CREATE POLICY "notices insert by warden or admin" ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_hostel_admin(auth.uid(), tenant_id, property_id)
      OR public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL)
    )
  );

CREATE POLICY "notices update by author or admin" ON public.notices
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_hostel_admin(auth.uid(), tenant_id, property_id)
  );

-- =========== notifications ===========
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  recipient_user_id UUID,
  recipient_phone TEXT,
  recipient_email CITEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP','SMS','WHATSAPP','EMAIL')),
  template_key TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','DELIVERED','FAILED','CANCELLED')),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_notif_recipient ON public.notifications(recipient_user_id, created_at DESC);
CREATE INDEX idx_notif_status_scheduled ON public.notifications(status, scheduled_for);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_notifications_updated BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recipients can read their own; only mark-as-read updates allowed
CREATE POLICY "notifications recipient read" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "notifications recipient mark read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- (No INSERT policy for authenticated → only service_role/DB functions insert)

-- =========== notification_attempts ===========
CREATE TABLE public.notification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_message_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('STARTED','ACCEPTED','DELIVERED','FAILED')),
  response_code TEXT,
  error_code TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_notif_attempts_notif ON public.notification_attempts(notification_id);
GRANT SELECT ON public.notification_attempts TO authenticated;
GRANT ALL ON public.notification_attempts TO service_role;
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_attempts recipient read" ON public.notification_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notifications n
            WHERE n.id = notification_attempts.notification_id
              AND n.recipient_user_id = auth.uid())
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notices REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- =========== In-app notification insert helper (SECURITY DEFINER) ===========
CREATE OR REPLACE FUNCTION public.fn_enqueue_in_app_notification(
  p_tenant_id UUID,
  p_property_id UUID,
  p_recipient_user_id UUID,
  p_event_type TEXT,
  p_template_key TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_recipient_user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (
    tenant_id, property_id, recipient_user_id, event_type, channel, template_key,
    payload, status, sent_at, delivered_at, idempotency_key
  ) VALUES (
    p_tenant_id, p_property_id, p_recipient_user_id, p_event_type, 'IN_APP', p_template_key,
    COALESCE(p_payload, '{}'::jsonb), 'DELIVERED', now(), now(), p_idempotency_key
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_enqueue_in_app_notification TO service_role;

-- =========== Rewire SLA scanner to emit IN_APP notifications ===========
CREATE OR REPLACE FUNCTION public.fn_scan_complaint_sla_breaches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_count int := 0;
  v_admin record;
  v_key TEXT;
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

    -- IN_APP: notify assigned warden
    IF r.assigned_to IS NOT NULL THEN
      v_key := 'sla:' || r.id::text || ':warden';
      PERFORM public.fn_enqueue_in_app_notification(
        r.tenant_id, r.property_id, r.assigned_to,
        'COMPLAINT_SLA_BREACH', 'complaint_sla_breach_warden',
        jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
        v_key
      );
    END IF;

    -- IN_APP: notify all HOSTEL_ADMIN in that property
    FOR v_admin IN
      SELECT DISTINCT user_id FROM public.role_assignments
       WHERE tenant_id = r.tenant_id AND role = 'HOSTEL_ADMIN'
         AND (property_id IS NULL OR property_id = r.property_id)
         AND (revoked_at IS NULL)
    LOOP
      v_key := 'sla:' || r.id::text || ':admin:' || v_admin.user_id::text;
      PERFORM public.fn_enqueue_in_app_notification(
        r.tenant_id, r.property_id, v_admin.user_id,
        'COMPLAINT_SLA_BREACH', 'complaint_sla_breach_admin',
        jsonb_build_object('complaint_id', r.id, 'complaint_number', r.complaint_number),
        v_key
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- =========== Fee reminder scheduled function ===========
CREATE OR REPLACE FUNCTION public.fn_send_fee_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record;
  guardian record;
  v_count int := 0;
  v_days_diff int;
  v_stage TEXT;
  v_key TEXT;
  v_student_uid UUID;
BEGIN
  FOR inv IN
    SELECT i.id, i.tenant_id, i.property_id, i.student_id, i.invoice_number,
           i.due_date, i.balance_paise, s.profile_id AS student_profile_id
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

    -- Parents (with can_pay_fees)
    FOR guardian IN
      SELECT g.profile_id AS uid
      FROM public.student_guardians sg
      JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = inv.student_id
        AND sg.unlinked_at IS NULL
        AND sg.can_pay_fees = true
        AND g.profile_id IS NOT NULL
    LOOP
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
    END LOOP;
  END LOOP;
  RETURN v_count;
END $$;

-- Schedule daily 09:00 UTC (14:30 IST)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fee-reminders-daily') THEN
    PERFORM cron.unschedule('fee-reminders-daily');
  END IF;
  PERFORM cron.schedule('fee-reminders-daily', '0 9 * * *', $cmd$SELECT public.fn_send_fee_reminders();$cmd$);
END $$;

-- NOTE(Phase 11): gate_events touchpoint deferred until gate_events table exists.
