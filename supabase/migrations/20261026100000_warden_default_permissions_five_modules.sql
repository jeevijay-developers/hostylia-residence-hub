-- Warden default access when Admin > Staff > "Customize Permissions" is OFF
-- (role_assignments.permissions = '{}'): only Students, Attendance,
-- Complaints and Gate (gate passes / visitors / gate events) are allowed.
-- Allocations (create/edit), Rooms/Beds (edit), Notices, Mess and any other
-- key resolved through these two checkers are denied unless explicitly
-- granted. Finance keys already default false for Warden (has_finance_permission).
--
-- Once customization is ON the saved bag is non-empty and the previous
-- semantics apply unchanged: explicit true/false wins, an absent key falls
-- back to the Warden default (true). Saved custom permissions are never
-- rewritten by this migration.
--
-- allocations_view / rooms_beds_view stay default-on for Warden as read-only
-- supporting data: the Students module (student detail) shows the student's
-- current allocation and bed. The Allocations / Rooms-Beds pages themselves
-- are hidden and route-guarded client-side, and every write (allocations
-- create/edit, rooms_beds create/edit/delete) is denied by default.
--
-- Function signatures are unchanged (CREATE OR REPLACE), so no policy is
-- touched. HOSTEL_ADMIN and ACCOUNTANT behavior is identical to before.

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
          AND (
            permissions <> '{}'::jsonb
            OR _key = ANY (ARRAY[
              'students_view', 'students_create', 'students_edit',
              'attendance_view', 'attendance_create', 'attendance_edit', 'attendance_delete',
              'complaints',
              'gate_passes_view', 'gate_passes_create', 'gate_passes_edit', 'gate_passes_delete',
              'visitors_view', 'visitors_create', 'visitors_edit', 'visitors_delete',
              'gate_events',
              'allocations_view', 'rooms_beds_view'
            ])
          )
        )
      )
  );
$$;

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
          AND (
            ra.permissions <> '{}'::jsonb
            OR _key = ANY (ARRAY[
              'students_view', 'students_create', 'students_edit',
              'attendance_view', 'attendance_create', 'attendance_edit', 'attendance_delete',
              'complaints',
              'gate_passes_view', 'gate_passes_create', 'gate_passes_edit', 'gate_passes_delete',
              'visitors_view', 'visitors_create', 'visitors_edit', 'visitors_delete',
              'gate_events',
              'allocations_view', 'rooms_beds_view'
            ])
          )
        )
      )
  );
$$;
