-- Force RLS on tenant tables that already have it enabled, make avatars
-- private to the agreed reader set, cap user-upload buckets, and send the
-- internal edge header from Vault. The secret value is not stored here.

-- Tenant tables with RLS enabled and not yet forced. Already forced:
-- support_tickets, support_ticket_messages, subscription_cancellations.
-- Platform catalogs (plans, plan_features, platform_role_assignments,
-- rate_limits, webhook_events), global profiles, and notification_attempts
-- (no tenant_id) are left unchanged.
ALTER TABLE public.agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.complaints FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_plan_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_surveys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.floors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gate_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gate_passes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mess_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mess_headcounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menu_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.visitors FORCE ROW LEVEL SECURITY;

-- Avatar paths are {auth.uid}/{timestamp}-{filename}. profiles.id is that uid.
-- SECURITY DEFINER so the tenant lookup is not hidden by role_assignments RLS
-- (SELECT there is self-only). Accountant, student, and parent are not readers
-- of anyone else's photo. Self insert/update/delete policies stay as they are.
CREATE OR REPLACE FUNCTION public.can_read_profile_avatar(p_owner_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_owner_folder IS NULL
     OR p_owner_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_owner := p_owner_folder::uuid;

  IF v_owner = auth.uid() OR public.is_super_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  -- Hostel admin who shares a tenant with this profile. Same helper the
  -- existing admin policies use (has_tenant_role(..., 'HOSTEL_ADMIN')).
  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = v_owner
      AND s.deleted_at IS NULL
      AND public.has_tenant_role(auth.uid(), s.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) OR EXISTS (
    SELECT 1 FROM public.role_assignments ra
    WHERE ra.user_id = v_owner
      AND ra.is_active
      AND ra.revoked_at IS NULL
      AND public.has_tenant_role(auth.uid(), ra.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = v_owner
      AND tm.status = 'ACTIVE'
      AND public.has_tenant_role(auth.uid(), tm.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) THEN
    RETURN true;
  END IF;

  -- Warden with property access where this profile is a student or staff member.
  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = v_owner
      AND s.deleted_at IS NULL
      AND public.warden_can_read_property(auth.uid(), s.tenant_id, s.property_id)
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.role_assignments staff
    WHERE staff.user_id = v_owner
      AND staff.is_active
      AND staff.revoked_at IS NULL
      AND staff.property_id IS NOT NULL
      AND staff.role IN (
        'HOSTEL_ADMIN'::public.app_role,
        'WARDEN'::public.app_role,
        'ACCOUNTANT'::public.app_role
      )
      AND public.warden_can_read_property(auth.uid(), staff.tenant_id, staff.property_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_profile_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_profile_avatar(text) TO authenticated;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;

CREATE POLICY "avatars authenticated read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.can_read_profile_avatar((storage.foldername(name))[1])
  );

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'avatars';

-- Same style of server limit for the other user-upload buckets.
-- Receipts stay untouched (edge-written, privacy unchanged).
UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'complaint-media';

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'kyc-documents';

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'support-ticket-attachments';

-- pg_net callers keep the existing Authorization bearer (verify_jwt stays on)
-- and add x-hostylia-internal from Vault. Empty when the secret is absent,
-- so the edge function rejects the call instead of this SQL embedding a value.
CREATE OR REPLACE FUNCTION public.fn_dispatch_notification(
  p_channel text,
  p_template_key text,
  p_recipient jsonb,
  p_variables jsonb,
  p_event_type text,
  p_tenant_id uuid,
  p_property_id uuid,
  p_reference_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal text;
BEGIN
  SELECT decrypted_secret INTO v_internal
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_FUNCTION_SECRET'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://umznrrdqduynifpatslb.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_vDuiCkZ6_69swy9eH9hk5Q_J8evIefy',
      'x-hostylia-internal', COALESCE(v_internal, '')
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
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dispatch_notification(text, text, jsonb, jsonb, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_retry_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal text;
BEGIN
  SELECT decrypted_secret INTO v_internal
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_FUNCTION_SECRET'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://umznrrdqduynifpatslb.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_vDuiCkZ6_69swy9eH9hk5Q_J8evIefy',
      'x-hostylia-internal', COALESCE(v_internal, '')
    ),
    body := jsonb_build_object('notificationId', p_notification_id::text)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_retry_notification(uuid) IS
  'Re-dispatches one existing FAILED notification via the send-notification edge function retry-mode branch. Sends x-hostylia-internal from Vault. Never blocks the caller (net.http_post is async).';

REVOKE ALL ON FUNCTION public.fn_retry_notification(uuid) FROM PUBLIC, anon, authenticated;
