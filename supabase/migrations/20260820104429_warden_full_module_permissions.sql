-- Admin > Staff > "Customize Permissions" needs a full per-module
-- Read/Create/Update/Delete grid for Warden (Students, Allocations,
-- Attendance, Complaints, Rooms/Beds, Gate Pass, Visitors, Notices,
-- Reports) instead of the current mix of "unconditional, not revocable"
-- (students create/edit, allocations, rooms/beds/blocks/floors read+edit)
-- and "one bundled key covers every verb" (attendance, gate_passes,
-- visitors). Same architecture as the two prior granular-permission
-- migrations — reuses has_operational_permission_property/_scope (already
-- default-WARDEN-true/default-ACCOUNTANT-false) and has_role_permission
-- (arbitrary default role, used for brand-new opt-in-only capabilities like
-- students_delete already did) — no new checker shape, no new table.
--
-- Checked live data first: no role_assignments row has a non-empty
-- `permissions` (same as the two prior migrations), so defaults below are
-- chosen purely to reproduce today's actual RLS behavior exactly — nothing
-- a Warden could already do becomes newly blocked, and nothing they
-- couldn't do becomes newly allowed, until an Admin explicitly changes a
-- toggle.
--
-- Per-module verb coverage (only verbs with a real corresponding RLS
-- action get a key/checkbox — no phantom permissions):
--   students:    view(new), create/edit(existing keys, redefined — see
--                below), delete(existing, unchanged: opt-in-only)
--   allocations: view/create/edit(new) — no delete key: no delete
--                capability exists for allocations anywhere (admin
--                included) — they're closed via status, not deleted.
--   rooms_beds:  view/edit(new, replaces unconditional-in-scope read/
--                update on blocks+floors+rooms+beds) create/delete(new
--                capability — Warden could never create/delete these
--                before; property-scoped opt-in, mirrors students_delete)
--   attendance:  view/create/edit/delete(new — splits the single bundled
--                `attendance` FOR ALL policy into 4 independent verbs,
--                same pattern the invoices pilot used)
--   gate_passes: view/create/edit/delete(new — same FOR ALL split)
--   visitors:    view/create/edit/delete(new — same FOR ALL split)
--   complaints:  view/edit only (existing `complaints` key, unchanged —
--                there's no complaints Create for staff, students create
--                them, and no Delete exists anywhere)
--   notices:     view/create only (existing `notices` key, unchanged —
--                Update/Delete were never staff-manage capabilities;
--                authors can already edit their own notice regardless,
--                that's self-authorship, not this module's grant)
--   reports:     view only — client-side gate. Reports pages read from
--                already-RLS'd resources (attendance/complaints/etc security
--                invoker views), so there is no separate "reports" table to
--                gate at the DB layer; this key only controls whether the
--                Reports nav/route is shown to a Warden, same spirit as
--                Design.md's "UI + policy layer" note in PRD Sec 7.1.
--                Stored here (not hardcoded client-side) so it's still an
--                auditable, admin-controlled toggle.

-- ============================================================
-- 1) New/redefined checker functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_view_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'students_view');
$$;

-- Redefined (same key names, same function names — the pilot migration
-- pointed these at has_role_permission(...,'HOSTEL_ADMIN',...), which only
-- ever gated the *additional* opt-in "students granted insert/update"
-- policies; the actually-unconditional "students warden write/update"
-- policies below are now retired in favour of these, so the default must
-- flip to WARDEN=true/ACCOUNTANT=false to reproduce today's real access.
CREATE OR REPLACE FUNCTION public.can_create_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'students_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'students_edit');
$$;
-- can_delete_students is untouched (still has_role_permission(...,'HOSTEL_ADMIN','students_delete')).

CREATE OR REPLACE FUNCTION public.can_view_allocations(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'allocations_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_allocations(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'allocations_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_allocations(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'allocations_edit');
$$;

CREATE OR REPLACE FUNCTION public.can_view_rooms_beds(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'rooms_beds_view');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_rooms_beds(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'rooms_beds_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_create_rooms_beds(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'rooms_beds_create');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_rooms_beds(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'rooms_beds_delete');
$$;

CREATE OR REPLACE FUNCTION public.can_view_attendance(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'attendance_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_attendance(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'attendance_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_attendance(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'attendance_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_attendance(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'attendance_delete');
$$;

-- can_view_gate_passes already exists (used by gate_pass_approvals'
-- gpa_read_scoped policy too) — redefined to the new verb-specific key so
-- that call site benefits automatically without touching its policy.
CREATE OR REPLACE FUNCTION public.can_view_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'gate_passes_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'gate_passes_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'gate_passes_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_gate_passes(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_scope(_user_id, _tenant_id, _property_id, _block_id, 'gate_passes_delete');
$$;

CREATE OR REPLACE FUNCTION public.can_view_visitors(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'visitors_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_visitors(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'visitors_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_visitors(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'visitors_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_visitors(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_operational_permission_property(_user_id, _tenant_id, _property_id, 'visitors_delete');
$$;

-- Grants for every new/changed function above.
DO $do$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'can_view_students(uuid,uuid,uuid)', 'can_create_students(uuid,uuid,uuid)', 'can_edit_students(uuid,uuid,uuid)',
    'can_view_allocations(uuid,uuid,uuid)', 'can_create_allocations(uuid,uuid,uuid,uuid)', 'can_edit_allocations(uuid,uuid,uuid,uuid)',
    'can_view_rooms_beds(uuid,uuid,uuid)', 'can_edit_rooms_beds(uuid,uuid,uuid,uuid)', 'can_create_rooms_beds(uuid,uuid,uuid)', 'can_delete_rooms_beds(uuid,uuid,uuid)',
    'can_view_attendance(uuid,uuid,uuid,uuid)', 'can_create_attendance(uuid,uuid,uuid,uuid)', 'can_edit_attendance(uuid,uuid,uuid,uuid)', 'can_delete_attendance(uuid,uuid,uuid,uuid)',
    'can_view_gate_passes(uuid,uuid,uuid)', 'can_create_gate_passes(uuid,uuid,uuid,uuid)', 'can_edit_gate_passes(uuid,uuid,uuid,uuid)', 'can_delete_gate_passes(uuid,uuid,uuid,uuid)',
    'can_view_visitors(uuid,uuid,uuid)', 'can_create_visitors(uuid,uuid,uuid)', 'can_edit_visitors(uuid,uuid,uuid)', 'can_delete_visitors(uuid,uuid,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END;
$do$;

-- ============================================================
-- 2) Widen the permissions JSONB shape
-- ============================================================
ALTER TABLE public.role_assignments DROP CONSTRAINT role_assignments_permissions_shape;
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_permissions_shape CHECK (
  jsonb_typeof(permissions) = 'object'
  AND (
    permissions
    - 'fee_plans' - 'payments' - 'refunds'
    - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
    - 'complaints' - 'gate_events' - 'notices' - 'mess_menus' - 'feedback'
    - 'students_view' - 'students_create' - 'students_edit' - 'students_delete'
    - 'allocations_view' - 'allocations_create' - 'allocations_edit'
    - 'rooms_beds_view' - 'rooms_beds_edit' - 'rooms_beds_create' - 'rooms_beds_delete'
    - 'attendance_view' - 'attendance_create' - 'attendance_edit' - 'attendance_delete'
    - 'gate_passes_view' - 'gate_passes_create' - 'gate_passes_edit' - 'gate_passes_delete'
    - 'visitors_view' - 'visitors_create' - 'visitors_edit' - 'visitors_delete'
    - 'reports_view'
  ) = '{}'::jsonb
  AND (NOT (permissions ? 'fee_plans') OR jsonb_typeof(permissions -> 'fee_plans') = 'boolean')
  AND (NOT (permissions ? 'payments') OR jsonb_typeof(permissions -> 'payments') = 'boolean')
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
);

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member overrides, one JSONB bag of {module}_{verb}: boolean (or a coarse {module}: boolean for resources with only one meaningful verb). Absent key = role default; HOSTEL_ADMIN is always unconditional. See can_view_*/can_create_*/can_edit_*/can_delete_* functions for the exact default per key. reports_view is client-side only (no RLS-gated "reports" resource exists — reports read from already-RLS-scoped views).';

-- ============================================================
-- 3) STUDENTS — split the combined admin/accountant/warden read
--    policy so Warden's branch is gated; retire the two unconditional
--    warden write/update policies in favour of the "granted" policies
--    (same INSERT/UPDATE policies, now backed by redefined functions).
-- ============================================================
DROP POLICY "students admin/warden read" ON public.students;
CREATE POLICY "students admin read" ON public.students FOR SELECT TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));
CREATE POLICY "students accountant read" ON public.students FOR SELECT TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT'::app_role));
CREATE POLICY "students warden read" ON public.students FOR SELECT TO authenticated
  USING (public.can_view_students(auth.uid(), tenant_id, property_id));

DROP POLICY "students warden write" ON public.students;
DROP POLICY "students warden update" ON public.students;
-- "students granted insert"/"students granted update" already exist and now
-- inherit the redefined can_create_students/can_edit_students bodies above.

-- ============================================================
-- 4) ALLOCATIONS
-- ============================================================
DROP POLICY "allocations warden read" ON public.allocations;
CREATE POLICY "allocations warden read" ON public.allocations FOR SELECT TO authenticated
  USING (public.can_view_allocations(auth.uid(), tenant_id, property_id));

DROP POLICY "allocations warden write" ON public.allocations;
CREATE POLICY "allocations warden write" ON public.allocations FOR INSERT TO authenticated
  WITH CHECK (public.can_create_allocations(auth.uid(), tenant_id, property_id, block_id));

DROP POLICY "allocations warden update" ON public.allocations;
CREATE POLICY "allocations warden update" ON public.allocations FOR UPDATE TO authenticated
  USING (public.can_edit_allocations(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_allocations(auth.uid(), tenant_id, property_id, block_id));

-- ============================================================
-- 5) ROOMS / BEDS / BLOCKS / FLOORS ("Rooms/Beds" module)
-- ============================================================
DROP POLICY blocks_warden_read ON public.blocks;
CREATE POLICY blocks_warden_read ON public.blocks FOR SELECT TO authenticated
  USING (public.can_view_rooms_beds(auth.uid(), tenant_id, property_id));
DROP POLICY blocks_warden_write ON public.blocks;
CREATE POLICY blocks_warden_write ON public.blocks FOR UPDATE TO authenticated
  USING (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, id))
  WITH CHECK (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, id));
CREATE POLICY blocks_warden_insert ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (public.can_create_rooms_beds(auth.uid(), tenant_id, property_id));
CREATE POLICY blocks_warden_delete ON public.blocks FOR DELETE TO authenticated
  USING (public.can_delete_rooms_beds(auth.uid(), tenant_id, property_id));

DROP POLICY floors_warden_read ON public.floors;
CREATE POLICY floors_warden_read ON public.floors FOR SELECT TO authenticated
  USING (public.can_view_rooms_beds(auth.uid(), tenant_id, property_id));
DROP POLICY floors_warden_write ON public.floors;
CREATE POLICY floors_warden_write ON public.floors FOR UPDATE TO authenticated
  USING (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY floors_warden_insert ON public.floors FOR INSERT TO authenticated
  WITH CHECK (public.can_create_rooms_beds(auth.uid(), tenant_id, property_id));
CREATE POLICY floors_warden_delete ON public.floors FOR DELETE TO authenticated
  USING (public.can_delete_rooms_beds(auth.uid(), tenant_id, property_id));

DROP POLICY rooms_warden_read ON public.rooms;
CREATE POLICY rooms_warden_read ON public.rooms FOR SELECT TO authenticated
  USING (public.can_view_rooms_beds(auth.uid(), tenant_id, property_id));
DROP POLICY rooms_warden_write ON public.rooms;
CREATE POLICY rooms_warden_write ON public.rooms FOR UPDATE TO authenticated
  USING (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY rooms_warden_insert ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (public.can_create_rooms_beds(auth.uid(), tenant_id, property_id));
CREATE POLICY rooms_warden_delete ON public.rooms FOR DELETE TO authenticated
  USING (public.can_delete_rooms_beds(auth.uid(), tenant_id, property_id));

DROP POLICY beds_warden_read ON public.beds;
CREATE POLICY beds_warden_read ON public.beds FOR SELECT TO authenticated
  USING (public.can_view_rooms_beds(auth.uid(), tenant_id, property_id));
DROP POLICY beds_warden_write ON public.beds;
CREATE POLICY beds_warden_write ON public.beds FOR UPDATE TO authenticated
  USING (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_rooms_beds(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY beds_warden_insert ON public.beds FOR INSERT TO authenticated
  WITH CHECK (public.can_create_rooms_beds(auth.uid(), tenant_id, property_id));
CREATE POLICY beds_warden_delete ON public.beds FOR DELETE TO authenticated
  USING (public.can_delete_rooms_beds(auth.uid(), tenant_id, property_id));

-- ============================================================
-- 6) ATTENDANCE — split the bundled FOR ALL policy into 4 verbs
-- ============================================================
DROP POLICY att_warden_write ON public.attendance;
CREATE POLICY att_warden_select ON public.attendance FOR SELECT TO authenticated
  USING (public.can_view_attendance(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY att_warden_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.can_create_attendance(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY att_warden_update ON public.attendance FOR UPDATE TO authenticated
  USING (public.can_edit_attendance(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_attendance(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY att_warden_delete ON public.attendance FOR DELETE TO authenticated
  USING (public.can_delete_attendance(auth.uid(), tenant_id, property_id, block_id));

-- ============================================================
-- 7) GATE PASSES — split the bundled FOR ALL policy into 4 verbs
-- ============================================================
DROP POLICY gp_warden ON public.gate_passes;
CREATE POLICY gp_warden_select ON public.gate_passes FOR SELECT TO authenticated
  USING (public.can_view_gate_passes(auth.uid(), tenant_id, property_id));
CREATE POLICY gp_warden_insert ON public.gate_passes FOR INSERT TO authenticated
  WITH CHECK (public.can_create_gate_passes(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY gp_warden_update ON public.gate_passes FOR UPDATE TO authenticated
  USING (public.can_edit_gate_passes(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.can_edit_gate_passes(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY gp_warden_delete ON public.gate_passes FOR DELETE TO authenticated
  USING (public.can_delete_gate_passes(auth.uid(), tenant_id, property_id, block_id));

-- ============================================================
-- 8) VISITORS — split the bundled FOR ALL policy into 4 verbs
-- ============================================================
DROP POLICY vis_warden ON public.visitors;
CREATE POLICY vis_warden_select ON public.visitors FOR SELECT TO authenticated
  USING (public.can_view_visitors(auth.uid(), tenant_id, property_id));
CREATE POLICY vis_warden_insert ON public.visitors FOR INSERT TO authenticated
  WITH CHECK (public.can_create_visitors(auth.uid(), tenant_id, property_id));
CREATE POLICY vis_warden_update ON public.visitors FOR UPDATE TO authenticated
  USING (public.can_edit_visitors(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_visitors(auth.uid(), tenant_id, property_id));
CREATE POLICY vis_warden_delete ON public.visitors FOR DELETE TO authenticated
  USING (public.can_delete_visitors(auth.uid(), tenant_id, property_id));

-- ============================================================
-- 9) Retire the coarse bundled checkers — every policy above has been
--    re-pointed at the verb-specific functions, so nothing references
--    these anymore (must run after all policy rewrites above).
-- ============================================================
DROP FUNCTION IF EXISTS public.can_manage_attendance(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_manage_gate_passes(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_manage_visitors(uuid, uuid, uuid);
