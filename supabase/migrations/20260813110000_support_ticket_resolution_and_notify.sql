-- "Resolved by" was genuinely missing — resolved_at/resolution_note already
-- existed, resolved_by did not.
ALTER TABLE public.support_tickets ADD COLUMN resolved_by uuid REFERENCES public.profiles(id);

-- Notify the ticket-raising Hostel Admin when Super Admin resolves their
-- ticket — same trigger-on-row-transition pattern as
-- fn_notify_admins_complaint_resolved (20260730121453): resolution can only
-- happen client-side via a plain `.update()`, and `notifications` has no
-- client INSERT policy, so a trigger on the transition itself is the only
-- reliable place to raise this regardless of which code path flips status.
-- Reuses the existing `notifications` table / IN_APP delivery / realtime
-- subscription / NotificationBell — no new notification infrastructure.
CREATE OR REPLACE FUNCTION public.fn_notify_admin_ticket_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    tenant_id, recipient_user_id, event_type, channel,
    template_key, payload, status, sent_at, delivered_at, idempotency_key
  ) VALUES (
    NEW.tenant_id, NEW.created_by, 'SUPPORT_TICKET_RESOLVED', 'IN_APP',
    'support_ticket_resolved_admin',
    jsonb_build_object(
      'title', 'Support ticket resolved',
      'body', NEW.subject,
      'ticket_id', NEW.id
    ),
    'DELIVERED', now(), now(),
    'support_ticket_resolved:' || NEW.id
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_admin_ticket_resolved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_support_tickets_notify_resolved ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_notify_resolved
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  WHEN (NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_notify_admin_ticket_resolved();
