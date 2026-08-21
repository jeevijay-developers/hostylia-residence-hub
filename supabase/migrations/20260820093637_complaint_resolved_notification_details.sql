-- Admin-facing "Complaint Resolved" toast needs the complaint id (to deep
-- link "View complaint") and a human resolver label ("Super Admin" vs a
-- named staff member) in the notification payload up front — the client has
-- no cheap way to resolve that itself off a bare `resolved_by` uuid without
-- an extra round trip per toast. Also stop notifying the very user who
-- performed the resolve (they already get a synchronous "Marked resolved"
-- toast from their own mutation) to avoid a redundant duplicate toast when
-- an admin resolves their own tenant's complaint.
CREATE OR REPLACE FUNCTION public.fn_notify_admins_complaint_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
  resolver_label text;
BEGIN
  IF NEW.resolved_by IS NOT NULL THEN
    IF public.is_super_admin(NEW.resolved_by) THEN
      resolver_label := 'Super Admin';
    ELSE
      SELECT p.full_name INTO resolver_label FROM public.profiles p WHERE p.id = NEW.resolved_by;
    END IF;
  END IF;

  FOR admin_id IN
    SELECT DISTINCT user_id FROM public.role_assignments
    WHERE tenant_id = NEW.tenant_id AND role = 'HOSTEL_ADMIN' AND is_active = true
      AND user_id IS DISTINCT FROM NEW.resolved_by
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
        'complaint_number', NEW.complaint_number,
        'complaint_id', NEW.id,
        'resolved_by', NEW.resolved_by,
        'resolved_by_label', resolver_label
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
