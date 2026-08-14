-- Hostylia Support Tickets: a Hostel Admin raising a technical/product issue
-- with Hostylia's internal Super Admin team. Deliberately separate from the
-- existing `complaints` table (Student→Warden→Admin operational-complaint
-- lifecycle, untouched) — this is platform support, not hostel operations.
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  subject text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'TECHNICAL_ISSUE','LOGIN_AUTH','FINANCE_BILLING','GATE_PASS',
    'ATTENDANCE','COMPLAINTS','REPORTS','STUDENT_MANAGEMENT','OTHER'
  )),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN','IN_PROGRESS','WAITING_FOR_ADMIN','RESOLVED','CLOSED'
  )),
  description text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  support_session_id uuid REFERENCES public.support_sessions(id),
  resolution_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_tenant_idx ON public.support_tickets(tenant_id);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status);

CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_select_scoped ON public.support_tickets
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
);

-- Hostel Admin creates their own tenant's ticket only.
CREATE POLICY support_tickets_insert_admin ON public.support_tickets
FOR INSERT WITH CHECK (
  public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
  AND created_by = auth.uid()
);

-- Every other field (status/priority/assignment/resolution) is a Super Admin
-- action — Hostel Admin's one permitted transition (RESOLVED -> CLOSED) goes
-- through fn_close_own_support_ticket below instead of a direct RLS grant,
-- same pattern as fn_cancel_own_subscription.
CREATE POLICY support_tickets_update_super ON public.support_tickets
FOR UPDATE USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Replies + Super-Admin-only internal notes. Append-only (no UPDATE/DELETE
-- policy at all), same immutability pattern as audit_logs.
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  is_internal_note boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_messages_select_scoped ON public.support_ticket_messages
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    AND is_internal_note = false
  )
);

CREATE POLICY support_ticket_messages_insert_scoped ON public.support_ticket_messages
FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
      AND is_internal_note = false
    )
  )
);

-- Hostel-Admin-only self-service close: only RESOLVED -> CLOSED, only for
-- their own tenant's ticket. All authorization happens inside the function
-- (hard DB-layer gate), same pattern as fn_cancel_own_subscription.
CREATE OR REPLACE FUNCTION public.fn_close_own_support_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_now timestamptz := now();
BEGIN
  SELECT tenant_id, status INTO v_tenant_id, v_status
  FROM public.support_tickets WHERE id = p_ticket_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF NOT public.has_tenant_role(auth.uid(), v_tenant_id, 'HOSTEL_ADMIN'::app_role) THEN
    RAISE EXCEPTION 'Only the Hostel Admin who owns this ticket may close it';
  END IF;

  IF v_status <> 'RESOLVED' THEN
    RAISE EXCEPTION 'Only a RESOLVED ticket can be closed';
  END IF;

  UPDATE public.support_tickets SET status = 'CLOSED', closed_at = v_now WHERE id = p_ticket_id;

  INSERT INTO public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (v_tenant_id, auth.uid(), 'SUPPORT_TICKET_CLOSED_BY_HOSTEL_ADMIN', 'support_tickets', p_ticket_id,
    jsonb_build_object('status', 'CLOSED'));

  RETURN jsonb_build_object('id', p_ticket_id, 'status', 'CLOSED', 'closed_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_close_own_support_ticket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_close_own_support_ticket(uuid) TO authenticated;

-- Reuse the existing generic `documents` registry for ticket attachments
-- instead of inventing a parallel attachment mechanism.
ALTER TABLE public.documents DROP CONSTRAINT documents_owner_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_owner_type_check
  CHECK (owner_type = ANY (ARRAY[
    'STUDENT','GUARDIAN','ADMISSION','ALLOCATION','PROPERTY','COMPLAINT',
    'VISITOR','INVOICE','RECEIPT','SUPPORT_TICKET_MESSAGE','OTHER'
  ]));

-- Narrow addition: Super Admin needs to read ticket-attachment metadata
-- cross-tenant (the existing "documents admin all" policy already covers
-- Hostel Admin's own tenant, untouched) — scoped strictly to this one
-- owner_type, not a general widening of Super Admin's document access.
CREATE POLICY "documents super admin support ticket read" ON public.documents
FOR SELECT USING (
  owner_type = 'SUPPORT_TICKET_MESSAGE' AND public.is_super_admin(auth.uid())
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-ticket-attachments', 'support-ticket-attachments', false);

CREATE POLICY "support-ticket-attachments read" ON storage.objects
FOR SELECT USING (
  bucket_id = 'support-ticket-attachments'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid, 'HOSTEL_ADMIN'::app_role)
  )
);

CREATE POLICY "support-ticket-attachments write" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'support-ticket-attachments'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid, 'HOSTEL_ADMIN'::app_role)
  )
);
