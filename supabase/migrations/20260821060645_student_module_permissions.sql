-- Student module-level permissions (Read / Edit / No Access), admin-configurable.
--
-- Every student-self RLS policy today is hardcoded unconditionally true for
-- the owning student (is_owning_student()/is_own_student() with no
-- permission check). This migration reuses the exact same architecture
-- Warden/Accountant already have — role_assignments.permissions JSONB,
-- checked via a has_*_permission() helper — instead of a parallel system.
-- Students already get their own role_assignments row (role='STUDENT', one
-- per student, created for tenant/property scoping) which this now puts to
-- use for permissions too.
--
-- Model: 2 boolean keys per module (student_<module>_view/_edit), not full
-- CRUD — matches the product's 3-tier Read/Edit/No-Access requirement.
-- No Access = view:false. Read = view:true, edit:false. Edit = both true.
-- Default (key absent) = true for both, so an unconfigured student sees
-- zero behavior change from before this migration.
--
-- Scope: the 7 real student-facing modules (Profile, Attendance, Complaints,
-- Notices, Finance, Gate Pass, Mess) — not Allocations/Visitors/Support,
-- which have no dedicated student page today. Allocation history is folded
-- into the Profile module (shown alongside the student's own record).
--
-- Keys are prefixed `student_` (not the bare `complaints`/`gate_passes_*`
-- names WARDEN/ACCOUNTANT already use in the same JSONB column) to avoid
-- semantic confusion in the shared permissions_shape CHECK constraint.

-- ============================================================
-- 1) Helper — resolves the caller's own STUDENT role_assignments row and
--    reads one permission key, defaulting when absent OR when the caller
--    isn't a student at all (so it's always safe to AND into a policy that
--    also serves staff/parent readers, e.g. notices).
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_student_permission_for_user(_user_id uuid, _key text, _default boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (ra.permissions ->> _key)::boolean
     FROM public.students s
     JOIN public.role_assignments ra
       ON ra.user_id = s.profile_id AND ra.tenant_id = s.tenant_id AND ra.role = 'STUDENT' AND ra.is_active
     WHERE s.profile_id = _user_id AND s.deleted_at IS NULL
     ORDER BY ra.granted_at DESC LIMIT 1),
    _default
  );
$$;

REVOKE ALL ON FUNCTION public.has_student_permission_for_user(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_student_permission_for_user(uuid, text, boolean) TO authenticated;

-- ============================================================
-- 2) Per-module view/edit functions. Each wraps the existing ownership
--    helper (is_owning_student / is_own_student — reused, not redefined)
--    AND the permission check above.
-- ============================================================

-- Profile (students self row, agreements, KYC documents, allocation history)
CREATE OR REPLACE FUNCTION public.can_student_view_profile(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_own_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_profile_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_profile(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_own_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_profile_edit', true);
$$;

-- Attendance (read-only for students — no Edit tier)
CREATE OR REPLACE FUNCTION public.can_student_view_attendance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_attendance_view', true);
$$;

-- Complaints
CREATE OR REPLACE FUNCTION public.can_student_view_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_complaints_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_complaints_edit', true);
$$;

-- Notices (tenant-wide broadcast, read-only — no Edit tier, no student_id)
CREATE OR REPLACE FUNCTION public.can_student_view_notices(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_student_permission_for_user(_user_id, 'student_notices_view', true);
$$;

-- Finance (invoices, payments, payment_orders, refunds, deposit_ledger_entries)
CREATE OR REPLACE FUNCTION public.can_student_view_finance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_finance_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_finance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_finance_edit', true);
$$;

-- Gate Pass (gate_passes, gate_pass_approvals, gate_events)
CREATE OR REPLACE FUNCTION public.can_student_view_gate_passes(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_gate_passes_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_gate_passes(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_gate_passes_edit', true);
$$;

-- Mess (mess_menus is property-scoped, not owned by one student; mess_feedback is)
CREATE OR REPLACE FUNCTION public.can_student_view_mess(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_student_permission_for_user(_user_id, 'student_mess_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_view_mess_feedback(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_mess_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_mess(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_mess_edit', true);
$$;

DO $do$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'can_student_view_profile(uuid,uuid)', 'can_student_edit_profile(uuid,uuid)',
    'can_student_view_attendance(uuid,uuid)',
    'can_student_view_complaints(uuid,uuid)', 'can_student_edit_complaints(uuid,uuid)',
    'can_student_view_notices(uuid)',
    'can_student_view_finance(uuid,uuid)', 'can_student_edit_finance(uuid,uuid)',
    'can_student_view_gate_passes(uuid,uuid)', 'can_student_edit_gate_passes(uuid,uuid)',
    'can_student_view_mess(uuid)', 'can_student_view_mess_feedback(uuid,uuid)', 'can_student_edit_mess(uuid,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END;
$do$;

-- ============================================================
-- 3) Widen the permissions JSONB shape with the 12 new student_* keys.
-- ============================================================
ALTER TABLE public.role_assignments DROP CONSTRAINT role_assignments_permissions_shape;
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_permissions_shape CHECK (
  jsonb_typeof(permissions) = 'object'
  AND (
    permissions
    - 'refunds'
    - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
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
    - 'student_profile_view' - 'student_profile_edit'
    - 'student_attendance_view'
    - 'student_complaints_view' - 'student_complaints_edit'
    - 'student_notices_view'
    - 'student_finance_view' - 'student_finance_edit'
    - 'student_gate_passes_view' - 'student_gate_passes_edit'
    - 'student_mess_view' - 'student_mess_edit'
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
);

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member (or per-student) overrides, one JSONB bag of {module}_{verb}: boolean (or a coarse {module}: boolean for resources with only one meaningful verb). Absent key = role default; HOSTEL_ADMIN is always unconditional. reports_view is client-side only (no RLS-gated reports resource exists). fee_plans_view/create/edit and payments_view/create default true for ACCOUNTANT; *_delete and payments_edit default to HOSTEL_ADMIN-only (opt-in). student_* keys (student_profile_view/edit, student_attendance_view, student_complaints_view/edit, student_notices_view, student_finance_view/edit, student_gate_passes_view/edit, student_mess_view/edit) apply only to STUDENT-role rows, default true (both view+edit) so an unconfigured student is unaffected; admin sets a module to Read (view:true,edit:false) or No Access (view:false) per student via the Student Permissions UI.';

-- ============================================================
-- 4) Rewrite existing student-self RLS policies to route through the new
--    functions instead of the bare is_owning_student()/is_own_student()
--    checks. Same table/command/joins as before — only the terminal
--    boolean check changes. Staff/parent clauses on shared policies are
--    left untouched.
-- ============================================================

-- students (Profile)
DROP POLICY "students self read" ON public.students;
CREATE POLICY "students self read" ON public.students FOR SELECT TO authenticated
  USING (public.can_student_view_profile(auth.uid(), id));
DROP POLICY "students self update" ON public.students;
CREATE POLICY "students self update" ON public.students FOR UPDATE TO authenticated
  USING (public.can_student_edit_profile(auth.uid(), id))
  WITH CHECK (public.can_student_edit_profile(auth.uid(), id));

-- agreements (Profile)
DROP POLICY "agreements student read" ON public.agreements;
CREATE POLICY "agreements student read" ON public.agreements FOR SELECT TO authenticated
  USING (public.can_student_view_profile(auth.uid(), student_id));
DROP POLICY "agreements student sign" ON public.agreements;
CREATE POLICY "agreements student sign" ON public.agreements FOR UPDATE TO authenticated
  USING (public.can_student_edit_profile(auth.uid(), student_id))
  WITH CHECK (public.can_student_edit_profile(auth.uid(), student_id));

-- allocations (Profile — allocation history shown on the student's own record)
DROP POLICY "allocations student read" ON public.allocations;
CREATE POLICY "allocations student read" ON public.allocations FOR SELECT TO authenticated
  USING (public.can_student_view_profile(auth.uid(), student_id));

-- documents (Profile — KYC uploads)
DROP POLICY "documents student self read" ON public.documents;
CREATE POLICY "documents student self read" ON public.documents FOR SELECT TO authenticated
  USING (owner_type = 'STUDENT' AND public.can_student_view_profile(auth.uid(), owner_id));
DROP POLICY "documents student self insert" ON public.documents;
CREATE POLICY "documents student self insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_type = 'STUDENT' AND public.can_student_edit_profile(auth.uid(), owner_id));

-- attendance
DROP POLICY att_student_read ON public.attendance;
CREATE POLICY att_student_read ON public.attendance FOR SELECT TO authenticated
  USING (public.can_student_view_attendance(auth.uid(), student_id));

-- complaints
DROP POLICY "complaints student self read" ON public.complaints;
CREATE POLICY "complaints student self read" ON public.complaints FOR SELECT TO authenticated
  USING (public.can_student_view_complaints(auth.uid(), student_id));
DROP POLICY "complaints student self insert" ON public.complaints;
CREATE POLICY "complaints student self insert" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (public.can_student_edit_complaints(auth.uid(), student_id));
DROP POLICY "complaints student self update" ON public.complaints;
CREATE POLICY "complaints student self update" ON public.complaints FOR UPDATE TO authenticated
  USING (public.can_student_edit_complaints(auth.uid(), student_id))
  WITH CHECK (public.can_student_edit_complaints(auth.uid(), student_id));

-- complaint_comments
DROP POLICY "complaint comments student read" ON public.complaint_comments;
CREATE POLICY "complaint comments student read" ON public.complaint_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_comments.complaint_id
      AND public.can_student_view_complaints(auth.uid(), c.student_id)
  ));
DROP POLICY "complaint comments student insert" ON public.complaint_comments;
CREATE POLICY "complaint comments student insert" ON public.complaint_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_comments.complaint_id
      AND public.can_student_edit_complaints(auth.uid(), c.student_id)
  ));

-- notices (broadcast — layer a student-only gate onto the existing tenant-wide policy)
DROP POLICY "notices read published in tenant" ON public.notices;
CREATE POLICY "notices read published in tenant" ON public.notices FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED' AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = notices.tenant_id)
    AND public.can_student_view_notices(auth.uid())
  );

-- invoices / payments / payment_orders / refunds / deposit_ledger_entries (Finance)
DROP POLICY invoices_student_read ON public.invoices;
CREATE POLICY invoices_student_read ON public.invoices FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id));

DROP POLICY payments_student_read ON public.payments;
CREATE POLICY payments_student_read ON public.payments FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

DROP POLICY porders_student_own ON public.payment_orders;
CREATE POLICY porders_student_own ON public.payment_orders FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));
DROP POLICY porders_student_insert ON public.payment_orders;
CREATE POLICY porders_student_insert ON public.payment_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_student_edit_finance(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

DROP POLICY refunds_student_read ON public.refunds;
CREATE POLICY refunds_student_read ON public.refunds FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

DROP POLICY dep_ledger_student_read ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_student_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_paying_parent(auth.uid(), student_id));

-- gate_events / gate_passes / gate_pass_approvals (Gate Pass)
DROP POLICY ge_student_read ON public.gate_events;
CREATE POLICY ge_student_read ON public.gate_events FOR SELECT TO authenticated
  USING (student_id IS NOT NULL AND public.can_student_view_gate_passes(auth.uid(), student_id));

DROP POLICY gp_student_own_read ON public.gate_passes;
CREATE POLICY gp_student_own_read ON public.gate_passes FOR SELECT TO authenticated
  USING (public.can_student_view_gate_passes(auth.uid(), student_id));
DROP POLICY gp_student_insert ON public.gate_passes;
CREATE POLICY gp_student_insert ON public.gate_passes FOR INSERT TO authenticated
  WITH CHECK (
    public.can_student_edit_gate_passes(auth.uid(), student_id)
    AND status = ANY (ARRAY['DRAFT'::text, 'PENDING_PARENT'::text, 'PENDING_WARDEN'::text])
  );
DROP POLICY gp_student_cancel ON public.gate_passes;
CREATE POLICY gp_student_cancel ON public.gate_passes FOR UPDATE TO authenticated
  USING (public.can_student_edit_gate_passes(auth.uid(), student_id))
  WITH CHECK (public.can_student_edit_gate_passes(auth.uid(), student_id));

DROP POLICY gpa_read_scoped ON public.gate_pass_approvals;
CREATE POLICY gpa_read_scoped ON public.gate_pass_approvals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gate_passes gp
    WHERE gp.id = gate_pass_approvals.gate_pass_id
      AND (public.can_view_gate_passes(auth.uid(), gp.tenant_id, gp.property_id)
           OR public.can_student_view_gate_passes(auth.uid(), gp.student_id))
  ));

-- mess_feedback / mess_menus (Mess)
DROP POLICY mf_student_read ON public.mess_feedback;
CREATE POLICY mf_student_read ON public.mess_feedback FOR SELECT TO authenticated
  USING (public.can_student_view_mess_feedback(auth.uid(), student_id));
DROP POLICY mf_student_insert ON public.mess_feedback;
CREATE POLICY mf_student_insert ON public.mess_feedback FOR INSERT TO authenticated
  WITH CHECK (public.can_student_edit_mess(auth.uid(), student_id));

DROP POLICY mm_student_read ON public.mess_menus;
CREATE POLICY mm_student_read ON public.mess_menus FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.property_id = mess_menus.property_id AND s.profile_id = auth.uid())
    AND public.can_student_view_mess(auth.uid())
  );
