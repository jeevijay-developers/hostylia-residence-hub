-- =============================================================================
-- Complaint reopening: the normal Admin "Reopen" goes away; exceptional reopening of a RESOLVED or
-- CLOSED complaint is possible ONLY through a dedicated, permissioned, reason-mandatory, audited
-- override. Everything is enforced in the database; hiding the UI button is not the control.
--
-- Who may reopen after this migration:
--   * the complaint's STUDENT, RESOLVED complaints only, inside the existing 48h window (unchanged:
--     fn_complaints_guard_self_update + fn_complaint_lifecycle);
--   * an Admin holding the dedicated `complaint_reopen_override` permission, via
--     fn_admin_reopen_complaint(complaint, reason), for RESOLVED or CLOSED complaints;
--   * nobody else - not wardens, not Admins without the permission, not a direct API UPDATE, not the
--     service role. CANCELLED stays permanently non-reopenable, override included.
-- No new table: the permission is a new key in the existing role_assignments.permissions JSON, the
-- activity-history entry is a complaint_comments row (the thread both sides already see), and the
-- durable audit record goes to the existing audit_logs. Existing rows/history are not modified.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The dedicated permission: a new allow-listed key (boolean) in role_assignments.permissions.
--    Constraint rebuilt from the live definition (20261022100000) plus the one new key.
-- ---------------------------------------------------------------------------
ALTER TABLE public.role_assignments
  DROP CONSTRAINT role_assignments_permissions_shape;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (
      permissions
      - 'refunds' - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
      - 'complaints' - 'gate_events' - 'notices' - 'mess_menus' - 'feedback'
      - 'students_view' - 'students_create' - 'students_edit' - 'students_delete'
      - 'allocations_view' - 'allocations_create' - 'allocations_edit'
      - 'rooms_beds_view' - 'rooms_beds_edit' - 'rooms_beds_create' - 'rooms_beds_delete'
      - 'attendance_view' - 'attendance_create' - 'attendance_edit' - 'attendance_delete'
      - 'gate_passes_view' - 'gate_passes_create' - 'gate_passes_edit' - 'gate_passes_delete'
      - 'visitors_view' - 'visitors_create' - 'visitors_edit' - 'visitors_delete'
      - 'reports_view'
      - 'fee_plans_view' - 'fee_plans_create' - 'fee_plans_edit' - 'fee_plans_delete'
      - 'payments_view' - 'payments_create' - 'payments_edit' - 'payments_delete'
      - 'student_profile_view' - 'student_profile_edit' - 'student_attendance_view'
      - 'student_complaints_view' - 'student_complaints_edit' - 'student_notices_view'
      - 'student_finance_view' - 'student_finance_edit'
      - 'student_gate_passes_view' - 'student_gate_passes_edit'
      - 'student_mess_view' - 'student_mess_edit'
      - 'refund_verification'
      - 'complaint_reopen_override'
    ) = '{}'::jsonb
    AND (NOT (permissions ? 'refunds') OR jsonb_typeof(permissions -> 'refunds') = 'boolean')
    AND (NOT (permissions ? 'invoices_view') OR jsonb_typeof(permissions -> 'invoices_view') = 'boolean')
    AND (NOT (permissions ? 'invoices_create') OR jsonb_typeof(permissions -> 'invoices_create') = 'boolean')
    AND (NOT (permissions ? 'invoices_edit') OR jsonb_typeof(permissions -> 'invoices_edit') = 'boolean')
    AND (NOT (permissions ? 'invoices_delete') OR jsonb_typeof(permissions -> 'invoices_delete') = 'boolean')
    AND (NOT (permissions ? 'complaints') OR jsonb_typeof(permissions -> 'complaints') = 'boolean')
    AND (NOT (permissions ? 'gate_events') OR jsonb_typeof(permissions -> 'gate_events') = 'boolean')
    AND (NOT (permissions ? 'notices') OR jsonb_typeof(permissions -> 'notices') = 'boolean')
    AND (NOT (permissions ? 'mess_menus') OR jsonb_typeof(permissions -> 'mess_menus') = 'boolean')
    AND (NOT (permissions ? 'feedback') OR jsonb_typeof(permissions -> 'feedback') = 'boolean')
    AND (NOT (permissions ? 'students_view') OR jsonb_typeof(permissions -> 'students_view') = 'boolean')
    AND (NOT (permissions ? 'students_create') OR jsonb_typeof(permissions -> 'students_create') = 'boolean')
    AND (NOT (permissions ? 'students_edit') OR jsonb_typeof(permissions -> 'students_edit') = 'boolean')
    AND (NOT (permissions ? 'students_delete') OR jsonb_typeof(permissions -> 'students_delete') = 'boolean')
    AND (NOT (permissions ? 'allocations_view') OR jsonb_typeof(permissions -> 'allocations_view') = 'boolean')
    AND (NOT (permissions ? 'allocations_create') OR jsonb_typeof(permissions -> 'allocations_create') = 'boolean')
    AND (NOT (permissions ? 'allocations_edit') OR jsonb_typeof(permissions -> 'allocations_edit') = 'boolean')
    AND (NOT (permissions ? 'rooms_beds_view') OR jsonb_typeof(permissions -> 'rooms_beds_view') = 'boolean')
    AND (NOT (permissions ? 'rooms_beds_edit') OR jsonb_typeof(permissions -> 'rooms_beds_edit') = 'boolean')
    AND (NOT (permissions ? 'rooms_beds_create') OR jsonb_typeof(permissions -> 'rooms_beds_create') = 'boolean')
    AND (NOT (permissions ? 'rooms_beds_delete') OR jsonb_typeof(permissions -> 'rooms_beds_delete') = 'boolean')
    AND (NOT (permissions ? 'attendance_view') OR jsonb_typeof(permissions -> 'attendance_view') = 'boolean')
    AND (NOT (permissions ? 'attendance_create') OR jsonb_typeof(permissions -> 'attendance_create') = 'boolean')
    AND (NOT (permissions ? 'attendance_edit') OR jsonb_typeof(permissions -> 'attendance_edit') = 'boolean')
    AND (NOT (permissions ? 'attendance_delete') OR jsonb_typeof(permissions -> 'attendance_delete') = 'boolean')
    AND (NOT (permissions ? 'gate_passes_view') OR jsonb_typeof(permissions -> 'gate_passes_view') = 'boolean')
    AND (NOT (permissions ? 'gate_passes_create') OR jsonb_typeof(permissions -> 'gate_passes_create') = 'boolean')
    AND (NOT (permissions ? 'gate_passes_edit') OR jsonb_typeof(permissions -> 'gate_passes_edit') = 'boolean')
    AND (NOT (permissions ? 'gate_passes_delete') OR jsonb_typeof(permissions -> 'gate_passes_delete') = 'boolean')
    AND (NOT (permissions ? 'visitors_view') OR jsonb_typeof(permissions -> 'visitors_view') = 'boolean')
    AND (NOT (permissions ? 'visitors_create') OR jsonb_typeof(permissions -> 'visitors_create') = 'boolean')
    AND (NOT (permissions ? 'visitors_edit') OR jsonb_typeof(permissions -> 'visitors_edit') = 'boolean')
    AND (NOT (permissions ? 'visitors_delete') OR jsonb_typeof(permissions -> 'visitors_delete') = 'boolean')
    AND (NOT (permissions ? 'reports_view') OR jsonb_typeof(permissions -> 'reports_view') = 'boolean')
    AND (NOT (permissions ? 'fee_plans_view') OR jsonb_typeof(permissions -> 'fee_plans_view') = 'boolean')
    AND (NOT (permissions ? 'fee_plans_create') OR jsonb_typeof(permissions -> 'fee_plans_create') = 'boolean')
    AND (NOT (permissions ? 'fee_plans_edit') OR jsonb_typeof(permissions -> 'fee_plans_edit') = 'boolean')
    AND (NOT (permissions ? 'fee_plans_delete') OR jsonb_typeof(permissions -> 'fee_plans_delete') = 'boolean')
    AND (NOT (permissions ? 'payments_view') OR jsonb_typeof(permissions -> 'payments_view') = 'boolean')
    AND (NOT (permissions ? 'payments_create') OR jsonb_typeof(permissions -> 'payments_create') = 'boolean')
    AND (NOT (permissions ? 'payments_edit') OR jsonb_typeof(permissions -> 'payments_edit') = 'boolean')
    AND (NOT (permissions ? 'payments_delete') OR jsonb_typeof(permissions -> 'payments_delete') = 'boolean')
    AND (NOT (permissions ? 'student_profile_view') OR jsonb_typeof(permissions -> 'student_profile_view') = 'boolean')
    AND (NOT (permissions ? 'student_profile_edit') OR jsonb_typeof(permissions -> 'student_profile_edit') = 'boolean')
    AND (NOT (permissions ? 'student_attendance_view') OR jsonb_typeof(permissions -> 'student_attendance_view') = 'boolean')
    AND (NOT (permissions ? 'student_complaints_view') OR jsonb_typeof(permissions -> 'student_complaints_view') = 'boolean')
    AND (NOT (permissions ? 'student_complaints_edit') OR jsonb_typeof(permissions -> 'student_complaints_edit') = 'boolean')
    AND (NOT (permissions ? 'student_notices_view') OR jsonb_typeof(permissions -> 'student_notices_view') = 'boolean')
    AND (NOT (permissions ? 'student_finance_view') OR jsonb_typeof(permissions -> 'student_finance_view') = 'boolean')
    AND (NOT (permissions ? 'student_finance_edit') OR jsonb_typeof(permissions -> 'student_finance_edit') = 'boolean')
    AND (NOT (permissions ? 'student_gate_passes_view') OR jsonb_typeof(permissions -> 'student_gate_passes_view') = 'boolean')
    AND (NOT (permissions ? 'student_gate_passes_edit') OR jsonb_typeof(permissions -> 'student_gate_passes_edit') = 'boolean')
    AND (NOT (permissions ? 'student_mess_view') OR jsonb_typeof(permissions -> 'student_mess_view') = 'boolean')
    AND (NOT (permissions ? 'student_mess_edit') OR jsonb_typeof(permissions -> 'student_mess_edit') = 'boolean')
    AND (NOT (permissions ? 'refund_verification') OR jsonb_typeof(permissions -> 'refund_verification') = 'boolean')
    AND (NOT (permissions ? 'complaint_reopen_override') OR jsonb_typeof(permissions -> 'complaint_reopen_override') = 'boolean')
  );

-- Opt-in only: no role (HOSTEL_ADMIN included) has it by default. It is honoured only on an active
-- HOSTEL_ADMIN assignment whose scope covers the complaint's property.
CREATE OR REPLACE FUNCTION public.fn_user_can_override_reopen(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments ra
     WHERE ra.user_id = _user_id AND ra.tenant_id = _tenant_id AND ra.is_active = true
       AND ra.role = 'HOSTEL_ADMIN'::public.app_role
       AND (ra.property_id IS NULL OR ra.property_id = _property_id)
       AND (ra.permissions ->> 'complaint_reopen_override') = 'true'
  );
$$;
REVOKE ALL ON FUNCTION public.fn_user_can_override_reopen(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Client-facing check (decides whether to show the button). Always about the caller, so it cannot
-- be used to probe anyone else's permissions.
CREATE OR REPLACE FUNCTION public.can_override_reopen_complaint(_tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.fn_user_can_override_reopen(auth.uid(), _tenant_id, _property_id);
$$;
REVOKE ALL ON FUNCTION public.can_override_reopen_complaint(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_override_reopen_complaint(uuid, uuid) TO authenticated;

-- An Admin must not be able to hand this permission to themselves through the (RLS-allowed) edit of
-- their own assignment: only a platform super admin, or a trusted backend / migration without an
-- end-user session, may change it.
CREATE OR REPLACE FUNCTION public.fn_role_assignments_guard_reopen_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.permissions ->> 'complaint_reopen_override' END;
  v_new text := NEW.permissions ->> 'complaint_reopen_override';
BEGIN
  IF v_new IS DISTINCT FROM v_old
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a platform administrator can grant or revoke the complaint reopen override permission.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_role_assignments_guard_reopen_override() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_role_assignments_guard_reopen_override ON public.role_assignments;
CREATE TRIGGER trg_role_assignments_guard_reopen_override
  BEFORE INSERT OR UPDATE OF permissions ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_role_assignments_guard_reopen_override();

-- ---------------------------------------------------------------------------
-- 2. Transition rules. Same function/trigger as 20261119090000; the only changes:
--      * CLOSED -> REOPENED exists, but only inside an authorised override;
--      * any REOPENED from RESOLVED/CLOSED must be either the student's own (the student guard keeps
--        it inside the 48h window) or the authorised override - a warden / admin / service-role /
--        direct API UPDATE is rejected.
--    The override is signalled by a transaction-local setting that only fn_admin_reopen_complaint
--    sets (for one complaint id, cleared straight after the UPDATE).
-- ---------------------------------------------------------------------------
-- Active only when BOTH hold: the flag names this complaint AND the caller really has the permission,
-- so the flag on its own (e.g. set by an unprivileged session) opens nothing.
CREATE OR REPLACE FUNCTION public.fn_complaint_reopen_override_active(_complaint_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_setting('hostylia.complaint_reopen_override', true), '') = _complaint_id::text
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.complaints c
        WHERE c.id = _complaint_id
          AND public.fn_user_can_override_reopen(auth.uid(), c.tenant_id, c.property_id)
     );
$$;
-- The status triggers run as the calling user, so they need EXECUTE; it only reports whether the
-- override is active and grants nothing.
REVOKE ALL ON FUNCTION public.fn_complaint_reopen_override_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complaint_reopen_override_active(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_complaint_validate_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ok boolean;
  v_override boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- only a reopen can use the override; every other transition never pays for the lookup
  v_override := NEW.status = 'REOPENED' AND public.fn_complaint_reopen_override_active(NEW.id);

  v_ok := CASE OLD.status
    WHEN 'OPEN'                THEN NEW.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    WHEN 'ASSIGNED'            THEN NEW.status IN ('IN_PROGRESS', 'RESOLVED')
    WHEN 'IN_PROGRESS'         THEN NEW.status IN ('RESOLVED')
    WHEN 'REOPENED'            THEN NEW.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    WHEN 'WAITING_FOR_STUDENT' THEN NEW.status IN ('IN_PROGRESS', 'RESOLVED')
    WHEN 'RESOLVED'            THEN NEW.status IN ('REOPENED', 'CLOSED')
    WHEN 'CLOSED'              THEN NEW.status = 'REOPENED' AND v_override   -- override only
    ELSE false                                  -- CANCELLED is terminal
  END;

  -- Closing is the system's job: only without an end-user session (pg_cron / service role),
  -- and only after the reopen window has really elapsed.
  IF v_ok AND OLD.status = 'RESOLVED' AND NEW.status = 'CLOSED' THEN
    v_ok := auth.uid() IS NULL
            AND OLD.reopen_until IS NOT NULL
            AND now() >= OLD.reopen_until;
  END IF;

  IF NOT v_ok THEN
    IF OLD.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'A cancelled complaint cannot be reopened or changed.';
    END IF;
    IF OLD.status = 'CLOSED' AND NEW.status = 'REOPENED' THEN
      RAISE EXCEPTION 'A closed complaint can only be reopened through the authorized Admin override.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Invalid complaint status change: % -> %', OLD.status, NEW.status;
  END IF;

  -- Who may reopen: the student (window enforced by the student guard / lifecycle) or the override.
  IF OLD.status = 'RESOLVED' AND NEW.status = 'REOPENED' AND NOT v_override THEN
    IF auth.uid() IS NULL OR NOT public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Only the student can reopen a resolved complaint (within 48 hours). Staff must use the Admin reopen override.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Lifecycle: identical to 20260715135938 except that the 48h-window check is skipped for the
-- authorised override (which exists precisely for requests outside the window). Resolved/closed
-- timestamps are cleared on every reopen, exactly as before.
CREATE OR REPLACE FUNCTION public.fn_complaint_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'RESOLVED' AND (OLD.status IS DISTINCT FROM 'RESOLVED') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    NEW.reopen_until := NEW.resolved_at + interval '48 hours';
  END IF;
  IF NEW.status = 'CLOSED' AND (OLD.status IS DISTINCT FROM 'CLOSED') THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;
  IF NEW.status = 'REOPENED' AND OLD.status IN ('RESOLVED','CLOSED') THEN
    IF NOT public.fn_complaint_reopen_override_active(NEW.id)
       AND (OLD.reopen_until IS NULL OR now() > OLD.reopen_until) THEN
      RAISE EXCEPTION 'Reopen window has expired (reopen_until=%)', OLD.reopen_until;
    END IF;
    NEW.resolved_at := NULL; NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The override itself. SECURITY DEFINER, row-locked, permission + reason + eligibility checked
--    here (not in the client). Records WHO (author / actor), WHEN and WHY in:
--      * complaint_comments  - the visible activity history (author_role is derived server-side);
--      * audit_logs          - the durable audit record (before/after status, reason, admin id).
--    Existing notifications fire as usual (status change + the history comment).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admin_reopen_complaint(p_complaint_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
  c public.complaints%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = p_complaint_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_can_override_reopen(v_uid, c.tenant_id, c.property_id) THEN
    RAISE EXCEPTION 'You do not have permission to use the complaint reopen override.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Please enter at least 10 characters explaining why this complaint is being reopened.'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'The reopen reason must be 1000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  IF c.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'A cancelled complaint cannot be reopened or changed.' USING ERRCODE = '22023';
  END IF;
  IF c.status NOT IN ('RESOLVED', 'CLOSED') THEN
    RAISE EXCEPTION 'Only a resolved or closed complaint can be reopened (current status: %).', c.status
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('hostylia.complaint_reopen_override', c.id::text, true);
  UPDATE public.complaints SET status = 'REOPENED' WHERE id = c.id;
  PERFORM set_config('hostylia.complaint_reopen_override', '', true);

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id,
                                 before_data, after_data, metadata)
  VALUES (c.tenant_id, c.property_id, v_uid, 'COMPLAINT_REOPEN_OVERRIDE', 'complaints', c.id,
          jsonb_build_object('status', c.status, 'resolved_at', c.resolved_at, 'closed_at', c.closed_at,
                             'reopen_until', c.reopen_until),
          jsonb_build_object('status', 'REOPENED'),
          jsonb_build_object('override', true, 'admin_id', v_uid, 'reason', v_reason,
                             'reopened_at', now(), 'complaint_number', c.complaint_number));

  INSERT INTO public.complaint_comments (tenant_id, property_id, complaint_id, author_user_id, body)
  VALUES (c.tenant_id, c.property_id, c.id, v_uid, 'Reopened by Admin override. Reason: ' || v_reason);
END $$;
REVOKE ALL ON FUNCTION public.fn_admin_reopen_complaint(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_reopen_complaint(uuid, text) TO authenticated;
