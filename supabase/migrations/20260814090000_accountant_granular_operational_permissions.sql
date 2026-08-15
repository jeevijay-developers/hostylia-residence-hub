-- Admin > Staff > Add > Accountant > "Customize Permissions" mirrors the
-- Warden finance case (20260814070000_warden_granular_finance_permissions.sql)
-- for the other direction: 8 Warden-operational areas an Accountant can be
-- individually granted, gated by their own resource, not one blanket flag.
--
-- Mapped to real independently-RLS'd resources (found by reading every
-- warden_can_read_property()/warden_can_write_scope() call site in
-- supabase/migrations):
--   attendance   -> public.attendance
--   complaints   -> public.complaints, public.complaint_comments
--   gate_passes  -> public.gate_passes, public.gate_pass_approvals
--   gate_events  -> public.gate_events (append-only; no block-level check
--                   existed before this migration either — preserved as-is)
--   visitors     -> public.visitors (no block_id column on this table)
--   notices      -> public.notices (insert/see-others'-drafts only — there
--                   was never a warden UPDATE policy here, preserved as-is)
--   mess_menus   -> public.mess_menus, mess_menu_items, mess_headcounts
--                   ("Mess menu, headcount" per PRD 4.2)
--   feedback     -> public.feedback_surveys, feedback_responses (the
--                   generic staff-authored survey tool — NOT mess_feedback,
--                   which has no staff write policy at all today, i.e.
--                   nothing to "manage" there; ridealong would be dishonest)
--
-- Two generic checkers (same default-access shape as
-- has_finance_permission(): explicit override always wins, HOSTEL_ADMIN is
-- unconditional, WARDEN defaults to true (revocable), ACCOUNTANT defaults to
-- false (grantable)) — split in two because the underlying policies
-- themselves are split between block-scoped (warden_can_write_scope) and
-- property-only (warden_can_read_property) checks; keeping that same split
-- for the granular replacements is what preserves existing Warden behavior
-- exactly (a block-scoped Warden was never block-filtered for
-- visitors/gate_events/mess/feedback, so their granular replacement isn't
-- either).

CREATE OR REPLACE FUNCTION public.has_operational_permission_property(_user_id uuid, _tenant_id uuid, _property_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND (property_id IS NULL OR property_id = _property_id)
      AND (
        role = 'HOSTEL_ADMIN'::app_role
        OR (permissions ->> _key) = 'true'
        OR (
          role = 'WARDEN'::app_role
          AND (permissions ->> _key) IS DISTINCT FROM 'false'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_operational_permission_property(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_operational_permission_property(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_operational_permission_scope(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments ra
    WHERE ra.user_id = _user_id AND ra.tenant_id = _tenant_id AND ra.is_active = true
      AND (ra.property_id IS NULL OR ra.property_id = _property_id)
      AND (ra.block_id IS NULL OR ra.block_id = _block_id)
      AND (
        ra.role = 'HOSTEL_ADMIN'::app_role
        OR (ra.permissions ->> _key) = 'true'
        OR (
          ra.role = 'WARDEN'::app_role
          AND (ra.permissions ->> _key) IS DISTINCT FROM 'false'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_operational_permission_scope(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_operational_permission_scope(uuid, uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_attendance(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'attendance');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_complaints(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'complaints');
$$;

CREATE OR REPLACE FUNCTION public.can_view_complaints(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'complaints');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'gate_passes');
$$;

CREATE OR REPLACE FUNCTION public.can_view_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'gate_passes');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_gate_events(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'gate_events');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_visitors(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'visitors');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, NULL, 'notices');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_mess_menus(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'mess_menus');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_feedback(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'feedback');
$$;

REVOKE ALL ON FUNCTION public.can_manage_attendance(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_complaints(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_complaints(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_gate_passes(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_gate_passes(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_gate_events(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_visitors(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_notices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_mess_menus(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_feedback(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_attendance(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_complaints(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_complaints(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_gate_passes(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_gate_passes(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_gate_events(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_visitors(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_notices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_mess_menus(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_feedback(uuid, uuid, uuid) TO authenticated;

-- role_assignments.permissions now carries both the finance keys (from the
-- prior migration) and these 8 operational keys — one column, since a given
-- override row is always read against the caller's own role (Accountant
-- reads only matter for operational keys, Warden reads only matter for
-- finance keys), so there's no cross-talk.
ALTER TABLE public.role_assignments
  DROP CONSTRAINT role_assignments_permissions_shape;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (
      permissions
      - 'fee_plans' - 'invoices' - 'payments' - 'refunds'
      - 'attendance' - 'complaints' - 'gate_passes' - 'gate_events'
      - 'visitors' - 'notices' - 'mess_menus' - 'feedback'
    ) = '{}'::jsonb
    AND (NOT (permissions ? 'fee_plans') OR jsonb_typeof(permissions -> 'fee_plans') = 'boolean')
    AND (NOT (permissions ? 'invoices') OR jsonb_typeof(permissions -> 'invoices') = 'boolean')
    AND (NOT (permissions ? 'payments') OR jsonb_typeof(permissions -> 'payments') = 'boolean')
    AND (NOT (permissions ? 'refunds') OR jsonb_typeof(permissions -> 'refunds') = 'boolean')
    AND (NOT (permissions ? 'attendance') OR jsonb_typeof(permissions -> 'attendance') = 'boolean')
    AND (NOT (permissions ? 'complaints') OR jsonb_typeof(permissions -> 'complaints') = 'boolean')
    AND (NOT (permissions ? 'gate_passes') OR jsonb_typeof(permissions -> 'gate_passes') = 'boolean')
    AND (NOT (permissions ? 'gate_events') OR jsonb_typeof(permissions -> 'gate_events') = 'boolean')
    AND (NOT (permissions ? 'visitors') OR jsonb_typeof(permissions -> 'visitors') = 'boolean')
    AND (NOT (permissions ? 'notices') OR jsonb_typeof(permissions -> 'notices') = 'boolean')
    AND (NOT (permissions ? 'mess_menus') OR jsonb_typeof(permissions -> 'mess_menus') = 'boolean')
    AND (NOT (permissions ? 'feedback') OR jsonb_typeof(permissions -> 'feedback') = 'boolean')
  );

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member overrides. Finance keys (fee_plans, invoices, payments, refunds) default true for ACCOUNTANT, false for WARDEN — see can_manage_fee_plans() etc. Operational keys (attendance, complaints, gate_passes, gate_events, visitors, notices, mess_menus, feedback) default true for WARDEN, false for ACCOUNTANT — see can_manage_attendance() etc. Absent key = role default; HOSTEL_ADMIN is always unconditional.';

-- ============ ATTENDANCE ============
DROP POLICY att_warden_write ON public.attendance;
CREATE POLICY att_warden_write ON public.attendance FOR ALL TO authenticated
  USING (public.can_manage_attendance(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_manage_attendance(auth.uid(), tenant_id, property_id, block_id));

-- ============ COMPLAINTS ============
DROP POLICY "complaints warden read" ON public.complaints;
CREATE POLICY "complaints warden read" ON public.complaints FOR SELECT TO authenticated
  USING (public.can_view_complaints(auth.uid(), tenant_id, property_id));

DROP POLICY "complaints warden update" ON public.complaints;
CREATE POLICY "complaints warden update" ON public.complaints FOR UPDATE TO authenticated
  USING (public.can_manage_complaints(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_manage_complaints(auth.uid(), tenant_id, property_id, block_id));

DROP POLICY "complaint comments staff" ON public.complaint_comments;
CREATE POLICY "complaint comments staff" ON public.complaint_comments FOR ALL TO authenticated
  USING (public.can_view_complaints(auth.uid(), tenant_id, property_id))
  WITH CHECK (author_user_id = auth.uid() AND public.can_view_complaints(auth.uid(), tenant_id, property_id));

-- ============ GATE PASSES ============
DROP POLICY gp_warden ON public.gate_passes;
CREATE POLICY gp_warden ON public.gate_passes FOR ALL TO authenticated
  USING (public.can_manage_gate_passes(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_manage_gate_passes(auth.uid(), tenant_id, property_id, block_id));

DROP POLICY gpa_read_scoped ON public.gate_pass_approvals;
CREATE POLICY gpa_read_scoped ON public.gate_pass_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gate_passes gp WHERE gp.id = gate_pass_id AND (
    public.can_view_gate_passes(auth.uid(), gp.tenant_id, gp.property_id)
    OR public.is_owning_student(auth.uid(), gp.student_id)
  )));

-- ============ GATE EVENTS ============
DROP POLICY ge_warden_read ON public.gate_events;
CREATE POLICY ge_warden_read ON public.gate_events FOR SELECT TO authenticated
  USING (public.can_manage_gate_events(auth.uid(), tenant_id, property_id));

DROP POLICY ge_warden_insert ON public.gate_events;
CREATE POLICY ge_warden_insert ON public.gate_events FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_gate_events(auth.uid(), tenant_id, property_id));

-- ============ VISITORS ============
DROP POLICY vis_warden ON public.visitors;
CREATE POLICY vis_warden ON public.visitors FOR ALL TO authenticated
  USING (public.can_manage_visitors(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_visitors(auth.uid(), tenant_id, property_id));

-- ============ NOTICES ============
DROP POLICY "notices author or admin manage" ON public.notices;
CREATE POLICY "notices author or admin manage" ON public.notices FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_manage_notices(auth.uid(), tenant_id, property_id)
  );

DROP POLICY "notices insert by warden or admin" ON public.notices;
CREATE POLICY "notices insert by warden or admin" ON public.notices FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_manage_notices(auth.uid(), tenant_id, property_id)
  );

-- ============ MESS MENU (menu + items + headcount) ============
DROP POLICY mm_warden ON public.mess_menus;
CREATE POLICY mm_warden ON public.mess_menus FOR ALL TO authenticated
  USING (public.can_manage_mess_menus(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_mess_menus(auth.uid(), tenant_id, property_id));

DROP POLICY mmi_scoped ON public.mess_menu_items;
CREATE POLICY mmi_scoped ON public.mess_menu_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mess_menus m WHERE m.id = mess_menu_id))
  WITH CHECK (public.can_manage_mess_menus(auth.uid(), tenant_id, property_id));

DROP POLICY mh_staff ON public.mess_headcounts;
CREATE POLICY mh_staff ON public.mess_headcounts FOR ALL TO authenticated
  USING (public.can_manage_mess_menus(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_mess_menus(auth.uid(), tenant_id, property_id));

-- ============ FEEDBACK (staff-authored surveys) ============
DROP POLICY fs_staff ON public.feedback_surveys;
CREATE POLICY fs_staff ON public.feedback_surveys FOR ALL TO authenticated
  USING (public.can_manage_feedback(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_manage_feedback(auth.uid(), tenant_id, property_id));

DROP POLICY fr_staff_read ON public.feedback_responses;
CREATE POLICY fr_staff_read ON public.feedback_responses FOR SELECT TO authenticated
  USING (public.can_manage_feedback(auth.uid(), tenant_id, property_id));
