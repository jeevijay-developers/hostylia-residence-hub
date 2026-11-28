-- Property staff roster (Property → Staff tab).
--
-- The app has exactly six LOGIN roles (app_role). Caretaker / Security /
-- Housekeeping / Mess Manager / Maintenance are JOB DESIGNATIONS of people who
-- work at a property, most of whom never sign in. This migration adds a roster
-- for them; it does NOT add an app_role and does not change role_assignments.
-- A roster row may point at an existing login (user_id) when the person is
-- also a Warden / Accountant with app access.
--
--   1. property_staff             — one row per person per property (soft delete).
--   2. property_staff_attendance  — one row per person per day
--                                   (PRESENT / ABSENT / ON_LEAVE).
--   3. Integrity trigger: property ∈ tenant, block ∈ property, a linked login
--      holds the row's role (Warden / Accountant) for this property, attendance
--      staff ∈ same property; tenant/property (and an attendance mark's staff /
--      date) can never be moved on update. Callers who are not an admin of the
--      row are rejected first with a generic 42501, so the specific integrity
--      errors can't be used to probe other tenants' properties, blocks, logins.
--   4. Audit trigger: every roster add / edit / status change / removal and
--      every attendance write is written to audit_logs with the caller as actor,
--      whichever client path made the change.
--   5. RLS (ENABLE + FORCE): Super Admin and the tenant's Hostel Admin (tenant-
--      wide, or scoped to this property) get full access; a Warden whose
--      assignment covers the property gets read-only access; nobody else.
--      No DELETE on the roster — removal is a soft delete (deleted_at).
-- Nothing existing is dropped or altered.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.property_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  designation text NOT NULL CHECK (designation IN (
    'WARDEN','ACCOUNTANT','CARETAKER','SECURITY','HOUSEKEEPING','MESS_MANAGER','MAINTENANCE','OTHER'
  )),
  block_id uuid REFERENCES public.blocks(id),
  work_area text,
  shift_name text,
  shift_start time,
  shift_end time,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_LEAVE','INACTIVE')),
  joined_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT property_staff_name_len CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT property_staff_phone_len CHECK (phone IS NULL OR char_length(phone) BETWEEN 6 AND 20),
  CONSTRAINT property_staff_email_len CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 255),
  CONSTRAINT property_staff_work_area_len CHECK (work_area IS NULL OR char_length(work_area) <= 60),
  CONSTRAINT property_staff_shift_name_len CHECK (shift_name IS NULL OR char_length(shift_name) <= 40),
  -- Both times or neither (a night shift may end "before" it starts).
  CONSTRAINT property_staff_shift_times CHECK ((shift_start IS NULL) = (shift_end IS NULL)),
  CONSTRAINT property_staff_notes_len CHECK (notes IS NULL OR char_length(notes) <= 1000)
);

COMMENT ON TABLE public.property_staff IS
  'Property staff roster. designation is a job title, NOT an app_role; user_id links the row to an app login when the person also has one.';

-- One live roster row per login per property.
CREATE UNIQUE INDEX uq_property_staff_property_user
  ON public.property_staff (property_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_property_staff_tenant_property ON public.property_staff (tenant_id, property_id);
CREATE INDEX idx_property_staff_property_live
  ON public.property_staff (property_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.property_staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  staff_id uuid NOT NULL REFERENCES public.property_staff(id),
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('PRESENT','ABSENT','ON_LEAVE')),
  note text,
  marked_by uuid DEFAULT auth.uid(),
  marked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_staff_attendance_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT uq_property_staff_attendance_day UNIQUE (staff_id, attendance_date)
);

CREATE INDEX idx_property_staff_attendance_tenant_property
  ON public.property_staff_attendance (tenant_id, property_id);
CREATE INDEX idx_property_staff_attendance_property_date
  ON public.property_staff_attendance (property_id, attendance_date);

-- ---------------------------------------------------------------------------
-- 2. updated_at / marked_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER property_staff_set_updated_at
  BEFORE UPDATE ON public.property_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_property_staff_attendance_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.marked_at := now();
  NEW.marked_by := COALESCE(auth.uid(), NEW.marked_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_property_staff_attendance_touch() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_staff_attendance_touch
  BEFORE UPDATE ON public.property_staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_staff_attendance_touch();

-- ---------------------------------------------------------------------------
-- 3. Integrity: never trust a client-supplied tenant / property / block / login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_property_staff_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- OLD is only read inside the UPDATE branch (never on INSERT).
  v_block_changed boolean := true;
  v_link_changed boolean := true;
  v_tenant uuid := NEW.tenant_id;
  v_property uuid := NEW.property_id;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_tenant := OLD.tenant_id;
    v_property := OLD.property_id;
  END IF;

  -- Authorise BEFORE any lookup: this runs ahead of the RLS WITH CHECK, so the
  -- distinct errors below would otherwise tell any signed-in user whether a
  -- property / block / login exists in another tenant. Same SQLSTATE as an RLS
  -- rejection. auth.uid() is NULL for service_role / migrations (no RLS anyway).
  IF auth.uid() IS NOT NULL AND NOT (
       public.is_super_admin(auth.uid())
       OR public.is_hostel_admin(auth.uid(), v_tenant, v_property)
     ) THEN
    RAISE EXCEPTION 'permission denied for table property_staff' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.property_id <> OLD.property_id THEN
      RAISE EXCEPTION 'A staff member cannot be moved to another tenant or property'
        USING ERRCODE = '23514';
    END IF;
    v_block_changed := NEW.block_id IS DISTINCT FROM OLD.block_id;
    -- Re-validate the login link when either the login or the role changes.
    v_link_changed := NEW.user_id IS DISTINCT FROM OLD.user_id
                      OR NEW.designation IS DISTINCT FROM OLD.designation;
  END IF;

  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property does not belong to this tenant' USING ERRCODE = '23514';
  END IF;

  -- Checked only when the block is set or changed, so a row whose block was
  -- later removed can still be edited or soft-deleted.
  IF NEW.block_id IS NOT NULL
     AND v_block_changed
     AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE b.id = NEW.block_id AND b.property_id = NEW.property_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Block does not belong to this property' USING ERRCODE = '23514';
  END IF;

  -- A linked login must hold this row's role (Warden / Accountant) for THIS
  -- property (or tenant-wide) — not just somewhere in the tenant.
  IF NEW.user_id IS NOT NULL
     AND v_link_changed
     AND NOT EXISTS (
       SELECT 1 FROM public.role_assignments ra
       WHERE ra.user_id = NEW.user_id AND ra.tenant_id = NEW.tenant_id
         AND (ra.property_id IS NULL OR ra.property_id = NEW.property_id)
         AND ra.role IN ('WARDEN'::app_role, 'ACCOUNTANT'::app_role)
         AND ra.role::text = NEW.designation
         AND ra.revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'The linked login is not a % of this property', initcap(NEW.designation)
      USING ERRCODE = '23514';
  END IF;

  NEW.full_name := btrim(NEW.full_name);
  NEW.email := NULLIF(lower(btrim(NEW.email)), '');
  NEW.phone := NULLIF(btrim(NEW.phone), '');
  NEW.work_area := NULLIF(btrim(NEW.work_area), '');
  NEW.shift_name := NULLIF(btrim(NEW.shift_name), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  -- Block wins over a free-text work area.
  IF NEW.block_id IS NOT NULL THEN NEW.work_area := NULL; END IF;

  IF NEW.deleted_at IS NOT NULL AND NEW.deleted_by IS NULL THEN
    NEW.deleted_by := auth.uid();
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_property_staff_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_staff_guard
  BEFORE INSERT OR UPDATE ON public.property_staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_staff_guard();

CREATE OR REPLACE FUNCTION public.fn_property_staff_attendance_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := NEW.tenant_id;
  v_property uuid := NEW.property_id;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_tenant := OLD.tenant_id;
    v_property := OLD.property_id;
  END IF;

  -- Authorise before the staff lookup (see fn_property_staff_guard).
  IF auth.uid() IS NOT NULL AND NOT (
       public.is_super_admin(auth.uid())
       OR public.is_hostel_admin(auth.uid(), v_tenant, v_property)
     ) THEN
    RAISE EXCEPTION 'permission denied for table property_staff_attendance'
      USING ERRCODE = '42501';
  END IF;

  -- A mark belongs to one person on one day: correct its status / note, or
  -- delete it and mark again — never re-point it (keeps the audit trail honest).
  IF TG_OP = 'UPDATE' AND (
       NEW.tenant_id <> OLD.tenant_id OR NEW.property_id <> OLD.property_id
       OR NEW.staff_id <> OLD.staff_id OR NEW.attendance_date <> OLD.attendance_date
     ) THEN
    RAISE EXCEPTION 'An attendance mark cannot be moved to another staff member or day'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.property_staff s
    WHERE s.id = NEW.staff_id
      AND s.tenant_id = NEW.tenant_id
      AND s.property_id = NEW.property_id
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Staff member does not belong to this property' USING ERRCODE = '23514';
  END IF;
  NEW.note := NULLIF(btrim(NEW.note), '');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_property_staff_attendance_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_staff_attendance_guard
  BEFORE INSERT OR UPDATE ON public.property_staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_staff_attendance_guard();

-- ---------------------------------------------------------------------------
-- 4. Audit (audit_logs has no client INSERT policy; this runs as definer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_property_staff_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
  v_before jsonb;
  v_after jsonb := to_jsonb(NEW) - 'updated_at';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'STAFF_ADDED';
  ELSE
    v_before := to_jsonb(OLD) - 'updated_at';
    IF v_before = v_after THEN RETURN NEW; END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'STAFF_REMOVED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND (v_before - 'status') = (v_after - 'status') THEN
      v_action := 'STAFF_STATUS_CHANGED';
    ELSE
      v_action := 'STAFF_UPDATED';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    NEW.tenant_id, NEW.property_id, auth.uid(), v_action, 'property_staff', NEW.id, v_before, v_after
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_property_staff_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_staff_audit
  AFTER INSERT OR UPDATE ON public.property_staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_staff_audit();

CREATE OR REPLACE FUNCTION public.fn_property_staff_attendance_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.property_staff_attendance;
  v_action text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_row := NEW; v_action := 'STAFF_ATTENDANCE_MARKED'; v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip only true no-ops: any change other than the touch columns is audited.
    IF (to_jsonb(NEW) - 'marked_at' - 'marked_by') = (to_jsonb(OLD) - 'marked_at' - 'marked_by') THEN
      RETURN NEW;
    END IF;
    v_row := NEW; v_action := 'STAFF_ATTENDANCE_CHANGED';
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
  ELSE
    v_row := OLD; v_action := 'STAFF_ATTENDANCE_CLEARED'; v_before := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_row.tenant_id, v_row.property_id, auth.uid(), v_action,
    'property_staff_attendance', v_row.id, v_before, v_after
  );
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.fn_property_staff_attendance_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_staff_attendance_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.property_staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_staff_attendance_audit();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.property_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_staff_attendance FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.property_staff FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.property_staff_attendance FROM PUBLIC, anon, authenticated;
-- Roster: no DELETE grant — removal is a soft delete.
GRANT SELECT, INSERT, UPDATE ON public.property_staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_staff_attendance TO authenticated;
GRANT ALL ON public.property_staff TO service_role;
GRANT ALL ON public.property_staff_attendance TO service_role;

CREATE POLICY property_staff_admin_select ON public.property_staff
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_admin_insert ON public.property_staff
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_admin_update ON public.property_staff
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_warden_read ON public.property_staff
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.warden_can_read_property(auth.uid(), tenant_id, property_id));

CREATE POLICY property_staff_attendance_admin_select ON public.property_staff_attendance
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_attendance_admin_insert ON public.property_staff_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_attendance_admin_update ON public.property_staff_attendance
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_attendance_admin_delete ON public.property_staff_attendance
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY property_staff_attendance_warden_read ON public.property_staff_attendance
  FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
