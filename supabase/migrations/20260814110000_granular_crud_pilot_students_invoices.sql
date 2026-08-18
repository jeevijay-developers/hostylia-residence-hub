-- Pilot for fully granular Customize Permissions: independent View/Create/
-- Edit/Delete toggles, actually enforced per verb, instead of one bundled
-- per-resource key. Scoped to two resources first (Students, Invoices) per
-- product decision, rather than rewriting RLS across the whole PRD Sec 7
-- matrix in one migration — the other already-granular modules (Warden's
-- fee_plans/payments/refunds, Accountant's 8 operational keys) are
-- deliberately left as coarse per-resource toggles for now.
--
-- Checked live data first: no role_assignments row has a non-empty
-- `permissions` yet, so the old bundled `invoices` key can be retired
-- outright rather than migrated.
--
-- Gaps are read off the *actual current RLS*, not the PRD table (PRD Sec 7
-- lists Warden as "VE" on student profiles; the real "students warden
-- write"/"students warden update" policies already grant Warden Create too
-- — CLAUDE.md says code, not docs, is ground truth). Only real gaps get a
-- toggle:
--   Students: Admin has V,C,E,D. Warden already has V,C,E by default
--     (existing unconditional policies, untouched) — only lacks Delete.
--     Accountant already has V by default (existing policy, untouched) —
--     lacks Create, Edit, Delete.
--   Invoices: Admin and Accountant already have V,C,E,D by default (today,
--     bundled in one `invoices` key/policy). Warden has none of the four.
--     Splitting the one FOR ALL policy into four means each verb can be
--     independently granted to Warden without also granting the others.
--     Receipts/Aging-DSO/GST-invoicing/discounts-waivers aren't separate
--     tables (see 20260814070000's note) — they ride along with View (read
--     surfaces) and Edit (GST fields, discount_paise) respectively.

-- One generic checker parameterized by *which* role holds the action by
-- default (or 'HOSTEL_ADMIN' when neither WARDEN nor ACCOUNTANT should —
-- HOSTEL_ADMIN already matches unconditionally via the first branch, so
-- passing it as the "default role" is a no-op that leaves both other roles
-- opt-in-only). Supersedes nothing existing — has_finance_permission() and
-- has_operational_permission_property() from the prior two migrations are
-- untouched and keep gating their own resources exactly as before.
CREATE OR REPLACE FUNCTION public.has_role_permission(_user_id uuid, _tenant_id uuid, _property_id uuid, _default_role public.app_role, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND (property_id IS NULL OR property_id = _property_id)
      AND (
        role = 'HOSTEL_ADMIN'::app_role
        OR (permissions ->> _key) = 'true'
        OR (
          role = _default_role
          AND (permissions ->> _key) IS DISTINCT FROM 'false'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_role_permission(uuid, uuid, uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, uuid, public.app_role, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'ACCOUNTANT'::public.app_role, 'invoices_view');
$$;
CREATE OR REPLACE FUNCTION public.can_create_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'ACCOUNTANT'::public.app_role, 'invoices_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'ACCOUNTANT'::public.app_role, 'invoices_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_invoices(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'ACCOUNTANT'::public.app_role, 'invoices_delete');
$$;

CREATE OR REPLACE FUNCTION public.can_create_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'students_create');
$$;
CREATE OR REPLACE FUNCTION public.can_edit_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'students_edit');
$$;
CREATE OR REPLACE FUNCTION public.can_delete_students(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_permission(_user_id, _tenant_id, _property_id, 'HOSTEL_ADMIN'::public.app_role, 'students_delete');
$$;

REVOKE ALL ON FUNCTION public.can_view_invoices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_create_invoices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_invoices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_invoices(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_create_students(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_students(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_students(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_invoices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_invoices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_invoices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_invoices(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_students(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_students(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_students(uuid, uuid, uuid) TO authenticated;

-- Retire the bundled `invoices` key, add the 4 verb keys + 3 student keys.
ALTER TABLE public.role_assignments
  DROP CONSTRAINT role_assignments_permissions_shape;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (
      permissions
      - 'fee_plans' - 'payments' - 'refunds'
      - 'invoices_view' - 'invoices_create' - 'invoices_edit' - 'invoices_delete'
      - 'attendance' - 'complaints' - 'gate_passes' - 'gate_events'
      - 'visitors' - 'notices' - 'mess_menus' - 'feedback'
      - 'students_create' - 'students_edit' - 'students_delete'
    ) = '{}'::jsonb
    AND (NOT (permissions ? 'fee_plans') OR jsonb_typeof(permissions -> 'fee_plans') = 'boolean')
    AND (NOT (permissions ? 'payments') OR jsonb_typeof(permissions -> 'payments') = 'boolean')
    AND (NOT (permissions ? 'refunds') OR jsonb_typeof(permissions -> 'refunds') = 'boolean')
    AND (NOT (permissions ? 'invoices_view') OR jsonb_typeof(permissions -> 'invoices_view') = 'boolean')
    AND (NOT (permissions ? 'invoices_create') OR jsonb_typeof(permissions -> 'invoices_create') = 'boolean')
    AND (NOT (permissions ? 'invoices_edit') OR jsonb_typeof(permissions -> 'invoices_edit') = 'boolean')
    AND (NOT (permissions ? 'invoices_delete') OR jsonb_typeof(permissions -> 'invoices_delete') = 'boolean')
    AND (NOT (permissions ? 'attendance') OR jsonb_typeof(permissions -> 'attendance') = 'boolean')
    AND (NOT (permissions ? 'complaints') OR jsonb_typeof(permissions -> 'complaints') = 'boolean')
    AND (NOT (permissions ? 'gate_passes') OR jsonb_typeof(permissions -> 'gate_passes') = 'boolean')
    AND (NOT (permissions ? 'gate_events') OR jsonb_typeof(permissions -> 'gate_events') = 'boolean')
    AND (NOT (permissions ? 'visitors') OR jsonb_typeof(permissions -> 'visitors') = 'boolean')
    AND (NOT (permissions ? 'notices') OR jsonb_typeof(permissions -> 'notices') = 'boolean')
    AND (NOT (permissions ? 'mess_menus') OR jsonb_typeof(permissions -> 'mess_menus') = 'boolean')
    AND (NOT (permissions ? 'feedback') OR jsonb_typeof(permissions -> 'feedback') = 'boolean')
    AND (NOT (permissions ? 'students_create') OR jsonb_typeof(permissions -> 'students_create') = 'boolean')
    AND (NOT (permissions ? 'students_edit') OR jsonb_typeof(permissions -> 'students_edit') = 'boolean')
    AND (NOT (permissions ? 'students_delete') OR jsonb_typeof(permissions -> 'students_delete') = 'boolean')
  );

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member overrides. Coarse per-resource keys (fee_plans, payments, refunds; attendance, complaints, gate_passes, gate_events, visitors, notices, mess_menus, feedback) default true for their normal role (ACCOUNTANT for the first 3, WARDEN for the rest), false otherwise. Granular per-verb keys (invoices_view/create/edit/delete default true for ACCOUNTANT, false for WARDEN; students_create/edit/delete default false for everyone but HOSTEL_ADMIN — Warden already has Create/Edit unconditionally via separate policies). Absent key = role default; HOSTEL_ADMIN is always unconditional.';

-- ============ INVOICES: split the one FOR ALL policy into 4 verbs ============
DROP POLICY invoices_staff_all ON public.invoices;
CREATE POLICY invoices_staff_select ON public.invoices FOR SELECT TO authenticated
  USING (public.can_view_invoices(auth.uid(), tenant_id, property_id));
CREATE POLICY invoices_staff_insert ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.can_create_invoices(auth.uid(), tenant_id, property_id));
CREATE POLICY invoices_staff_update ON public.invoices FOR UPDATE TO authenticated
  USING (public.can_edit_invoices(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_invoices(auth.uid(), tenant_id, property_id));
CREATE POLICY invoices_staff_delete ON public.invoices FOR DELETE TO authenticated
  USING (public.can_delete_invoices(auth.uid(), tenant_id, property_id));
-- invoices_student_read / invoices_parent_read are untouched.

-- Receipts storage bucket rode along with the old blanket `invoices` key —
-- now maps per verb: viewing a receipt is View, uploading is Create,
-- replacing is Edit, removing is Delete.
DROP POLICY receipts_finance_select ON storage.objects;
CREATE POLICY receipts_finance_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_view_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_write ON storage.objects;
CREATE POLICY receipts_finance_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_create_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_update ON storage.objects;
CREATE POLICY receipts_finance_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_edit_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );
DROP POLICY receipts_finance_delete ON storage.objects;
CREATE POLICY receipts_finance_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_delete_invoices(
           auth.uid(),
           NULLIF((storage.foldername(name))[1], '')::uuid,
           NULLIF((storage.foldername(name))[2], '')::uuid
         )
    )
  );

-- Nothing reads the bundled gate anymore.
DROP FUNCTION public.can_manage_invoices(uuid, uuid, uuid);

-- ============ STUDENTS: add opt-in Create/Edit/Delete on top of the
-- existing role-based policies (untouched — Warden's default Create/Edit,
-- Accountant's default View keep working exactly as before) ============
CREATE POLICY "students granted insert" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.can_create_students(auth.uid(), tenant_id, property_id));
CREATE POLICY "students granted update" ON public.students FOR UPDATE TO authenticated
  USING (public.can_edit_students(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.can_edit_students(auth.uid(), tenant_id, property_id));
CREATE POLICY "students granted delete" ON public.students FOR DELETE TO authenticated
  USING (public.can_delete_students(auth.uid(), tenant_id, property_id));
