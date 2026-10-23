-- Refund-submitted-for-approval notification: enrich the existing
-- PENDING_APPROVAL branch of fn_notify_refund_status_change (added in
-- 20261022100000) with refund id, student name and amount so the Admin
-- doesn't have to open the refund to see what it's about. Every other
-- branch (PENDING_VERIFICATION / REJECTED / APPROVED / COMPLETED / FAILED)
-- is reproduced unchanged — CREATE OR REPLACE requires the whole function
-- body, not just the one branch.
CREATE OR REPLACE FUNCTION public.fn_notify_refund_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_event text;
  v_title text;
  v_body text;
  v_template text;
  v_student_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Entry into PENDING_VERIFICATION (either at insert, or if ever reached via
  -- update) — every active Warden with the verification permission.
  IF NEW.status = 'PENDING_VERIFICATION' THEN
    FOR v_recipient IN
      SELECT DISTINCT user_id FROM public.role_assignments
      WHERE tenant_id = NEW.tenant_id AND role = 'WARDEN' AND is_active = true
        AND (property_id IS NULL OR property_id = NEW.property_id)
        AND public.can_verify_refunds(user_id, NEW.tenant_id, NEW.property_id)
    LOOP
      INSERT INTO public.notifications (
        tenant_id, property_id, recipient_user_id, event_type, channel,
        template_key, payload, status, sent_at, delivered_at, idempotency_key
      ) VALUES (
        NEW.tenant_id, NEW.property_id, v_recipient, 'REFUND_PENDING_VERIFICATION', 'IN_APP',
        'refund_pending_verification',
        jsonb_build_object('title', 'Refund needs deposit clearance', 'refund_number', NEW.refund_number),
        'DELIVERED', now(), now(),
        'refund_pending_verification:' || NEW.id || ':' || v_recipient
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Entry into PENDING_APPROVAL (either straight from insert, or after
  -- verification) — every active Hostel Admin. Payload carries refund_id
  -- (click target for NotificationBell -> /admin/finance/pnl), student name
  -- and amount so the Admin sees what it's about without opening it.
  IF NEW.status = 'PENDING_APPROVAL' THEN
    SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
    v_body := COALESCE(v_student_name, 'Unknown student') || ' — ' || NEW.currency || ' '
      || to_char(NEW.amount_paise / 100.0, 'FM999999999990.00');
    FOR v_recipient IN
      SELECT DISTINCT user_id FROM public.role_assignments
      WHERE tenant_id = NEW.tenant_id AND role = 'HOSTEL_ADMIN' AND is_active = true
        AND (property_id IS NULL OR property_id = NEW.property_id)
    LOOP
      INSERT INTO public.notifications (
        tenant_id, property_id, recipient_user_id, event_type, channel,
        template_key, payload, status, sent_at, delivered_at, idempotency_key
      ) VALUES (
        NEW.tenant_id, NEW.property_id, v_recipient, 'REFUND_PENDING_APPROVAL', 'IN_APP',
        'refund_pending_approval',
        jsonb_build_object(
          'title', 'Refund needs approval',
          'body', v_body,
          'refund_id', NEW.id,
          'refund_number', NEW.refund_number,
          'student_name', v_student_name,
          'amount_paise', NEW.amount_paise,
          'currency', NEW.currency
        ),
        'DELIVERED', now(), now(),
        'refund_pending_approval:' || NEW.id || ':' || v_recipient
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Everything else is a decision/outcome the initiator should hear about.
  v_recipient := NEW.initiated_by;
  v_event := CASE NEW.status
    WHEN 'REJECTED' THEN 'REFUND_REJECTED'
    WHEN 'APPROVED' THEN 'REFUND_APPROVED'
    WHEN 'COMPLETED' THEN 'REFUND_COMPLETED'
    WHEN 'FAILED' THEN 'REFUND_FAILED'
    ELSE NULL
  END;
  IF v_event IS NULL THEN RETURN NEW; END IF;

  v_title := CASE NEW.status
    WHEN 'REJECTED' THEN 'Refund rejected'
    WHEN 'APPROVED' THEN 'Refund approved'
    WHEN 'COMPLETED' THEN 'Refund completed'
    WHEN 'FAILED' THEN 'Refund failed'
  END;
  v_template := 'refund_' || lower(NEW.status);

  INSERT INTO public.notifications (
    tenant_id, property_id, recipient_user_id, event_type, channel,
    template_key, payload, status, sent_at, delivered_at, idempotency_key
  ) VALUES (
    NEW.tenant_id, NEW.property_id, v_recipient, v_event, 'IN_APP',
    v_template,
    jsonb_build_object(
      'title', v_title, 'refund_number', NEW.refund_number,
      'reason', COALESCE(NEW.decision_reason, NEW.failure_reason)
    ),
    'DELIVERED', now(), now(),
    'refund_status:' || NEW.id || ':' || NEW.status
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_notify_refund_status_change() FROM PUBLIC, anon, authenticated;
