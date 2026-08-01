-- Admin was never told a complaint got resolved — resolving only happens
-- client-side (warden.complaints.tsx does a plain `.update()`), and
-- `notifications` deliberately has no INSERT policy for `authenticated`
-- (see 20260716030218), so the only reliable place to raise this is a
-- trigger on the row transition itself, regardless of which UI flips it.
CREATE OR REPLACE FUNCTION public.fn_notify_admins_complaint_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
BEGIN
  FOR admin_id IN
    SELECT DISTINCT user_id FROM public.role_assignments
    WHERE tenant_id = NEW.tenant_id AND role = 'HOSTEL_ADMIN' AND is_active = true
  LOOP
    INSERT INTO public.notifications (
      tenant_id, property_id, recipient_user_id, event_type, channel,
      template_key, payload, status, sent_at, delivered_at, idempotency_key
    ) VALUES (
      NEW.tenant_id, NEW.property_id, admin_id, 'COMPLAINT_RESOLVED', 'IN_APP',
      'complaint_resolved_admin',
      jsonb_build_object(
        'title', 'Complaint resolved',
        'body', NEW.title,
        'complaint_number', NEW.complaint_number
      ),
      'DELIVERED', now(), now(),
      'complaint_resolved:' || NEW.id || ':' || admin_id
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_admins_complaint_resolved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaints_notify_admin_resolved ON public.complaints;
CREATE TRIGGER trg_complaints_notify_admin_resolved
  AFTER UPDATE ON public.complaints
  FOR EACH ROW
  WHEN (NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_notify_admins_complaint_resolved();
