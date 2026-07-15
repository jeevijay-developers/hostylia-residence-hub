
-- ============================================================
-- Phase 6: Messaging (conversations, participants, messages)
-- ============================================================

-- ---------- conversations ----------
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  conversation_type text NOT NULL CHECK (conversation_type IN ('PARENT_WARDEN','STUDENT_WARDEN','SUPPORT')),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  subject text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_tenant_property_idx ON public.conversations(tenant_id, property_id);
CREATE INDEX conversations_student_idx ON public.conversations(student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX conversations_open_parent_warden_per_student_uidx
  ON public.conversations(tenant_id, property_id, student_id, conversation_type)
  WHERE status = 'OPEN' AND conversation_type = 'PARENT_WARDEN' AND student_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

-- ---------- conversation_participants ----------
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  participant_role public.app_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  last_read_at timestamptz,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX cp_user_active_idx ON public.conversation_participants(user_id) WHERE left_at IS NULL;
CREATE INDEX cp_conversation_idx ON public.conversation_participants(conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;

-- ---------- messages ----------
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  message_type text NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT','IMAGE','FILE','SYSTEM')),
  body text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CHECK (body IS NOT NULL OR document_id IS NOT NULL)
);
CREATE INDEX messages_conversation_sent_idx ON public.messages(conversation_id, sent_at DESC);
CREATE INDEX messages_sender_idx ON public.messages(sender_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ---------- Sender must be an active participant (trigger) ----------
CREATE OR REPLACE FUNCTION public.validate_message_sender()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id
      AND user_id = NEW.sender_user_id
      AND left_at IS NULL
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Sender % is not an active participant of conversation %', NEW.sender_user_id, NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER messages_validate_sender
  BEFORE INSERT OR UPDATE OF sender_user_id, conversation_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_sender();

-- Bump conversation.updated_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER messages_bump_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Security-definer visibility helper ----------
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT id, student_id FROM public.conversations WHERE id = _conversation_id
  ), p AS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = _user_id
      AND left_at IS NULL
    LIMIT 1
  )
  SELECT EXISTS (SELECT 1 FROM p)
    AND (
      (SELECT student_id FROM c) IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.student_guardians sg
        JOIN public.guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = (SELECT student_id FROM c)
          AND sg.unlinked_at IS NULL
          AND g.deleted_at IS NULL
          AND g.profile_id = _user_id
      )
      OR NOT EXISTS (
        -- non-parent participants (warden/admin/etc.) bypass the guardian check
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = _conversation_id
          AND cp.user_id = _user_id
          AND cp.participant_role = 'PARENT'
      )
    );
$$;

-- ---------- RLS ----------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- conversations
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(auth.uid(), id));

CREATE POLICY conversations_admin_manage ON public.conversations
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN')
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id)
  )
  WITH CHECK (
    public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN')
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id)
  );

-- conversation_participants
CREATE POLICY cp_select ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(auth.uid(), conversation_id));

CREATE POLICY cp_update_self ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cp_admin_manage ON public.conversation_participants
  FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));

-- messages
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (public.can_access_conversation(auth.uid(), conversation_id));

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.can_access_conversation(auth.uid(), conversation_id)
  );

CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid())
  WITH CHECK (sender_user_id = auth.uid());

-- ---------- Realtime ----------
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
