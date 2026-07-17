
-- =============================================================================
-- 1) Column-level guards for student self-update policies
-- =============================================================================

-- Helper: is caller acting as the owning student (not staff)?
CREATE OR REPLACE FUNCTION public.fn_is_acting_as_student_only(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT (
    public.is_super_admin(auth.uid())
    OR public.has_any_tenant_role(auth.uid(), _tenant)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_is_acting_as_student_only(uuid) FROM PUBLIC, anon;

-- ---------- students ----------
CREATE OR REPLACE FUNCTION public.fn_students_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    IF NEW.tenant_id       IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id     IS DISTINCT FROM OLD.property_id
    OR NEW.status          IS DISTINCT FROM OLD.status
    OR NEW.is_minor        IS DISTINCT FROM OLD.is_minor
    OR NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled
    OR NEW.profile_id      IS DISTINCT FROM OLD.profile_id
    OR NEW.admission_number IS DISTINCT FROM OLD.admission_number
    OR NEW.enrolled_at     IS DISTINCT FROM OLD.enrolled_at
    OR NEW.moved_out_at    IS DISTINCT FROM OLD.moved_out_at
    OR NEW.deleted_at      IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled columns on their own record';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_students_guard_self_update ON public.students;
CREATE TRIGGER trg_students_guard_self_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.fn_students_guard_self_update();

-- ---------- agreements ----------
CREATE OR REPLACE FUNCTION public.fn_agreements_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    -- Students may only move DRAFT/SENT/PENDING_SIGNATURE -> SIGNED and attach signature evidence.
    IF NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id          IS DISTINCT FROM OLD.property_id
    OR NEW.student_id           IS DISTINCT FROM OLD.student_id
    OR NEW.allocation_id        IS DISTINCT FROM OLD.allocation_id
    OR NEW.agreement_number     IS DISTINCT FROM OLD.agreement_number
    OR NEW.effective_from       IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to         IS DISTINCT FROM OLD.effective_to
    OR NEW.void_reason          IS DISTINCT FROM OLD.void_reason
    OR NEW.voided_at            IS DISTINCT FROM OLD.voided_at
    OR NEW.voided_by            IS DISTINCT FROM OLD.voided_by
    OR NEW.deleted_at           IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled agreement columns';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status NOT IN ('DRAFT','SENT','PENDING_SIGNATURE') OR NEW.status <> 'SIGNED' THEN
        RAISE EXCEPTION 'Students may only sign a pending agreement (got % -> %)', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_agreements_guard_self_update ON public.agreements;
CREATE TRIGGER trg_agreements_guard_self_update
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.fn_agreements_guard_self_update();

-- ---------- gate_passes ----------
CREATE OR REPLACE FUNCTION public.fn_gate_passes_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    -- Students may only cancel their own pass; nothing else changes.
    IF NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id          IS DISTINCT FROM OLD.property_id
    OR NEW.block_id             IS DISTINCT FROM OLD.block_id
    OR NEW.student_id           IS DISTINCT FROM OLD.student_id
    OR NEW.pass_number          IS DISTINCT FROM OLD.pass_number
    OR NEW.warden_approved_by   IS DISTINCT FROM OLD.warden_approved_by
    OR NEW.warden_approved_at   IS DISTINCT FROM OLD.warden_approved_at
    OR NEW.parent_approved_by   IS DISTINCT FROM OLD.parent_approved_by
    OR NEW.parent_approved_at   IS DISTINCT FROM OLD.parent_approved_at
    OR NEW.expected_out_at      IS DISTINCT FROM OLD.expected_out_at
    OR NEW.expected_in_at       IS DISTINCT FROM OLD.expected_in_at
    OR NEW.actual_out_at        IS DISTINCT FROM OLD.actual_out_at
    OR NEW.actual_in_at         IS DISTINCT FROM OLD.actual_in_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled gate pass columns';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED' THEN
      RAISE EXCEPTION 'Students may only cancel their own gate pass (got % -> %)', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gate_passes_guard_self_update ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_guard_self_update
  BEFORE UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.fn_gate_passes_guard_self_update();

-- ---------- complaints ----------
CREATE OR REPLACE FUNCTION public.fn_complaints_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    -- Students may only edit description, title, priority (downgrade), attachments; not workflow fields.
    IF NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id          IS DISTINCT FROM OLD.property_id
    OR NEW.block_id             IS DISTINCT FROM OLD.block_id
    OR NEW.student_id           IS DISTINCT FROM OLD.student_id
    OR NEW.complaint_number     IS DISTINCT FROM OLD.complaint_number
    OR NEW.category_id          IS DISTINCT FROM OLD.category_id
    OR NEW.status               IS DISTINCT FROM OLD.status
    OR NEW.assigned_to          IS DISTINCT FROM OLD.assigned_to
    OR NEW.assigned_at          IS DISTINCT FROM OLD.assigned_at
    OR NEW.resolved_at          IS DISTINCT FROM OLD.resolved_at
    OR NEW.resolution_summary   IS DISTINCT FROM OLD.resolution_summary
    OR NEW.closed_at            IS DISTINCT FROM OLD.closed_at
    OR NEW.sla_due_at           IS DISTINCT FROM OLD.sla_due_at
    OR NEW.sla_breached_at      IS DISTINCT FROM OLD.sla_breached_at
    OR NEW.reopen_until         IS DISTINCT FROM OLD.reopen_until
    OR NEW.deleted_at           IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled complaint columns';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_complaints_guard_self_update ON public.complaints;
CREATE TRIGGER trg_complaints_guard_self_update
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaints_guard_self_update();

-- =============================================================================
-- 2) Warden role assignments MUST be scoped to a property
-- =============================================================================
ALTER TABLE public.role_assignments
  DROP CONSTRAINT IF EXISTS role_assignments_warden_requires_property;
ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_warden_requires_property
  CHECK (role <> 'WARDEN'::app_role OR property_id IS NOT NULL);

-- =============================================================================
-- 3) Revoke EXECUTE from anon on all SECURITY DEFINER functions in public
-- =============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
                     r.nspname, r.proname, r.args);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                     r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %.%(%): %', r.nspname, r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;
