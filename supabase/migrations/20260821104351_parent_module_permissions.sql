-- Parent Permission Matrix: admin-configurable per-guardian-relationship
-- permissions, extending the ALREADY-ESTABLISHED architecture rather than
-- building a parallel one. Parent access has never gone through
-- role_assignments (confirmed live: zero PARENT rows exist there) — it is
-- relationship-gated via student_guardians, which already has 6 boolean
-- capability columns (can_pay_fees, can_view_attendance, can_view_gate_events,
-- can_view_complaints, can_approve_gate_pass, portal_access_enabled) enforced
-- in live RLS. This migration adds 7 more of the same shape, then rewires
-- the existing "parent read" policies to check them (same technique as the
-- earlier student_module_permissions migration: same joins, swap the
-- terminal boolean).
--
-- Scope notes (see plan): "Leave Requests" = Gate Pass under another name,
-- no new table; parents approve gate passes (existing can_approve_gate_pass),
-- they don't create them (students do) — no new capability for that.
-- Document upload and a parent-editable student-profile subset don't exist
-- anywhere in the product today, so those stay read-only (no new columns
-- for them). Parent-authored complaints ARE new, real scope:
-- complaints.created_by already exists as a generic "who filed this" column.
--
-- Also fixes a live bug found during investigation: parent profile self-edit
-- (parent.profile.edit.tsx) does a raw client UPDATE on `guardians`, but no
-- self-update RLS policy exists for that table today (guardians_write_staff
-- is staff-only) — confirmed via live pg_policies. src/schemas/guardian.ts's
-- own comment already describes the intended design (a self-update policy +
-- a guard trigger blocking phone/tenant_id/profile_id/portal_access_enabled/
-- status/deleted_at) but neither was ever actually shipped to this DB
-- (confirmed: fn_guardians_guard_self_update doesn't exist, no trigger on
-- guardians). This migration builds that already-designed mechanism.
--
-- Also discovered live: the notices parent-read policy described in
-- migration file 20260812100000_parent_notice_access_policy.sql was never
-- actually applied here either (only "notices read published in tenant"
-- exists, which requires a tenant_memberships row — guardians don't have
-- one, confirmed live on a real linked parent). Building it now, gated by
-- the new can_view_notices column.

-- ============================================================
-- 1) New capability columns on student_guardians (per-relationship, same
--    naming/shape as the 6 existing ones).
-- ============================================================
ALTER TABLE public.student_guardians
  ADD COLUMN can_view_child_profile boolean NOT NULL DEFAULT true,
  ADD COLUMN can_view_finance boolean NOT NULL DEFAULT true,
  ADD COLUMN can_view_notices boolean NOT NULL DEFAULT true,
  ADD COLUMN can_view_room_allocation boolean NOT NULL DEFAULT true,
  ADD COLUMN can_view_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN can_create_complaints boolean NOT NULL DEFAULT true,
  ADD COLUMN can_edit_own_complaints boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.student_guardians.can_view_finance IS
  'Gates invoice/payment/refund/deposit-ledger READ (via is_viewing_parent()). can_pay_fees (existing) now means create/pay only, via is_paying_parent() — a guardian can view without being able to pay, or vice versa.';

-- ============================================================
-- 2) Guard functions — same SECURITY DEFINER shape as is_paying_parent(),
--    reusing its exact join pattern, one function per new capability.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_viewing_parent(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_view_finance, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guardian_view_child_profile(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_view_child_profile, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guardian_view_room_allocation(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_view_room_allocation, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guardian_view_documents(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_view_documents, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guardian_create_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_create_complaints, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guardian_edit_own_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
      AND COALESCE(sg.can_edit_own_complaints, false) = true
  );
$$;

-- Notices aren't per-student — a guardian sees the property-wide feed
-- through ANY of their active, notices-enabled links to a student at that
-- property.
CREATE OR REPLACE FUNCTION public.can_guardian_view_notices(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    JOIN public.students s ON s.id = sg.student_id
    WHERE g.profile_id = _user_id AND sg.unlinked_at IS NULL AND g.deleted_at IS NULL
      AND s.property_id = _property_id AND COALESCE(sg.can_view_notices, false) = true
  );
$$;

DO $do$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'is_viewing_parent(uuid,uuid)',
    'can_guardian_view_child_profile(uuid,uuid)',
    'can_guardian_view_room_allocation(uuid,uuid)',
    'can_guardian_view_documents(uuid,uuid)',
    'can_guardian_create_complaints(uuid,uuid)',
    'can_guardian_edit_own_complaints(uuid,uuid)',
    'can_guardian_view_notices(uuid,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END;
$do$;

-- ============================================================
-- 3) Rewrite existing parent-read policies — same joins, swap the terminal
--    boolean. Student-side clauses in shared OR-policies are untouched.
-- ============================================================
DROP POLICY "students parent read" ON public.students;
CREATE POLICY "students parent read" ON public.students FOR SELECT TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), id) AND public.can_guardian_view_child_profile(auth.uid(), id));

DROP POLICY invoices_parent_read ON public.invoices;
CREATE POLICY invoices_parent_read ON public.invoices FOR SELECT TO authenticated
  USING (public.is_viewing_parent(auth.uid(), student_id));

DROP POLICY payments_student_read ON public.payments;
CREATE POLICY payments_student_read ON public.payments FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_viewing_parent(auth.uid(), student_id));

DROP POLICY porders_student_own ON public.payment_orders;
CREATE POLICY porders_student_own ON public.payment_orders FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_viewing_parent(auth.uid(), student_id));
-- porders_student_insert unchanged — create/pay stays gated by is_paying_parent()/can_pay_fees.

DROP POLICY refunds_student_read ON public.refunds;
CREATE POLICY refunds_student_read ON public.refunds FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_viewing_parent(auth.uid(), student_id));

DROP POLICY dep_ledger_student_read ON public.deposit_ledger_entries;
CREATE POLICY dep_ledger_student_read ON public.deposit_ledger_entries FOR SELECT TO authenticated
  USING (public.can_student_view_finance(auth.uid(), student_id) OR public.is_viewing_parent(auth.uid(), student_id));

DROP POLICY "rooms parent read" ON public.rooms;
CREATE POLICY "rooms parent read" ON public.rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.room_id = rooms.id AND g.profile_id = auth.uid() AND sg.unlinked_at IS NULL AND g.deleted_at IS NULL
      AND public.can_guardian_view_room_allocation(auth.uid(), a.student_id)
  ));

DROP POLICY "beds parent read" ON public.beds;
CREATE POLICY "beds parent read" ON public.beds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.bed_id = beds.id AND g.profile_id = auth.uid() AND sg.unlinked_at IS NULL AND g.deleted_at IS NULL
      AND public.can_guardian_view_room_allocation(auth.uid(), a.student_id)
  ));

DROP POLICY "floors parent read" ON public.floors;
CREATE POLICY "floors parent read" ON public.floors FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.floor_id = floors.id AND g.profile_id = auth.uid() AND sg.unlinked_at IS NULL AND g.deleted_at IS NULL
      AND public.can_guardian_view_room_allocation(auth.uid(), a.student_id)
  ));

DROP POLICY "blocks parent read" ON public.blocks;
CREATE POLICY "blocks parent read" ON public.blocks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.block_id = blocks.id AND g.profile_id = auth.uid() AND sg.unlinked_at IS NULL AND g.deleted_at IS NULL
      AND public.can_guardian_view_room_allocation(auth.uid(), a.student_id)
  ));

DROP POLICY "documents parent read" ON public.documents;
CREATE POLICY "documents parent read" ON public.documents FOR SELECT TO authenticated
  USING (owner_type = 'STUDENT' AND EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = documents.owner_id AND sg.unlinked_at IS NULL AND g.profile_id = auth.uid()
  ) AND public.can_guardian_view_documents(auth.uid(), documents.owner_id));

-- ============================================================
-- 4) New: parent-authored complaints (real new scope — complaints.created_by
--    already exists as a generic "who filed this" column, not student-only).
--    Read policy ("complaints parent read") is unchanged — already gated by
--    can_view_complaints.
-- ============================================================
CREATE POLICY "complaints parent insert" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_guardian_of_student(auth.uid(), student_id)
    AND public.can_guardian_create_complaints(auth.uid(), student_id)
  );

CREATE POLICY "complaints parent update own" ON public.complaints FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.can_guardian_edit_own_complaints(auth.uid(), student_id))
  WITH CHECK (created_by = auth.uid() AND public.can_guardian_edit_own_complaints(auth.uid(), student_id));

-- ============================================================
-- 5) New: parent notices access (rebuilds what
--    20260812100000_parent_notice_access_policy.sql intended but was never
--    actually applied here — confirmed live, only "notices read published
--    in tenant" exists, which requires a tenant_memberships row guardians
--    don't have).
-- ============================================================
CREATE POLICY "notices read by linked parent" ON public.notices FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED' AND deleted_at IS NULL
    AND audience_type IN ('ALL', 'PARENTS')
    AND public.is_guardian_of_property(auth.uid(), property_id)
    AND public.can_guardian_view_notices(auth.uid(), property_id)
  );

-- ============================================================
-- 6) Fix the guardian self-profile-edit gap (was designed, never shipped —
--    src/schemas/guardian.ts's own comment describes exactly this).
-- ============================================================
CREATE POLICY guardians_self_update ON public.guardians FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_guardians_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Staff (Super Admin / Hostel Admin / Warden of this tenant) may change
  -- anything via guardians_write_staff — only restrict the self-service path.
  IF public.is_super_admin(auth.uid())
     OR public.has_tenant_role(auth.uid(), OLD.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
     OR public.has_tenant_role(auth.uid(), OLD.tenant_id, 'WARDEN'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Guardians may only update their own name, email, occupation and address';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_guardians_guard_self_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guardians_guard_self_update
  BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.fn_guardians_guard_self_update();

COMMENT ON TRIGGER trg_guardians_guard_self_update ON public.guardians IS
  'Backs guardians_self_update RLS policy — RLS is row-level only, this enforces which columns a self-edit may touch (blocks phone/tenant_id/profile_id/portal_access_enabled/status/deleted_at) regardless of what a client sends, matching guardianSelfEditSchema''s intended field list. Staff writes via guardians_write_staff are unaffected.';
