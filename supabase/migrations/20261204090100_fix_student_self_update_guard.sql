-- Security fix: the student self-update column lock was skipped for every
-- linked student. Kept separate from the Students-tab migration on purpose.
--
-- The hole
--   fn_is_acting_as_student_only(_tenant) decided "staff or not" with
--   has_any_tenant_role(), which is true for ANY active role_assignments row —
--   including the STUDENT (and PARENT) rows that confirmStudentAdmission,
--   provisionStudentPortalAccount and fn_link_public_applicant grant to every
--   linked student. So for a linked student the guard returned false and the
--   whole column lock in fn_students_guard_self_update was skipped: through the
--   'students self update' RLS policy (can_student_edit_profile) a student could
--   PATCH their own status, admission_number, deleted_at, profile_id and the
--   other staff-controlled columns. The guard also compared NEW.enrolled_at,
--   which does not exist on students (joined_at does), so the branch would have
--   raised "record new has no field" the moment it was finally reached.
--
-- The fix
--   Only real staff roles (HOSTEL_ADMIN, ACCOUNTANT, WARDEN; SUPER_ADMIN via the
--   platform table / is_super_admin) count as staff. auth.uid() IS NULL (service
--   role, Edge Functions, pg_cron) is still never treated as a student
--   (20260808130000). The guard compares joined_at instead of enrolled_at and
--   also locks deleted_by alongside deleted_at.
--
-- Other callers of fn_is_acting_as_student_only, re-checked against this change
-- (linked students / parents are now restricted exactly as their policies intend):
--   * fn_complaints_guard_self_update (20260807075627): students and parents
--     ("complaints parent update own") may edit text / rating and reopen within
--     the 48h window; workflow columns stay locked. Previously a linked student
--     or a parent holding a PARENT role row bypassed this.
--   * fn_complaint_validate_status_transition (20261120090000): "only the student can
--     reopen a resolved complaint" required fn_is_acting_as_student_only = true,
--     so linked students were wrongly REFUSED their own in-window reopen. They
--     are now allowed again; staff still need the admin override.
--   * fn_agreements_guard_self_update: a student may only sign a pending
--     agreement (acceptAgreementClickwrap writes status SIGNED + signature
--     columns only) — unaffected. Parents have no agreements UPDATE policy.
--   * fn_gate_passes_guard_self_update: a student may only cancel their own pass
--     (qr_token_hash re-issue is not a locked column) — unaffected. Parents have
--     no gate_passes UPDATE policy since 20261127090000.
--   * give_notice(): still works for students — its ACTIVE -> NOTICE_GIVEN write
--     is allowed through the transaction-local hostylia.notice_flow flag, which
--     until now was never actually exercised for linked students.
--   Staff-run SECURITY DEFINER paths (activate_allocation, complete_move_out,
--   fn_archive_student, fn_set_student_review_status, ...) run with a staff
--   auth.uid() or none, so they are unaffected.

CREATE OR REPLACE FUNCTION public.fn_is_acting_as_student_only(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.tenant_id = _tenant
        AND ra.is_active = true
        AND ra.role IN ('HOSTEL_ADMIN', 'ACCOUNTANT', 'WARDEN', 'SUPER_ADMIN')
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_is_acting_as_student_only(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fn_students_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notice_flow boolean :=
    COALESCE(current_setting('hostylia.notice_flow', true), '') = 'on'
    AND OLD.status = 'ACTIVE' AND NEW.status = 'NOTICE_GIVEN';
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    IF NEW.tenant_id       IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id     IS DISTINCT FROM OLD.property_id
    OR (NEW.status         IS DISTINCT FROM OLD.status AND NOT v_notice_flow)
    OR NEW.is_minor        IS DISTINCT FROM OLD.is_minor
    OR NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled
    OR NEW.profile_id      IS DISTINCT FROM OLD.profile_id
    OR NEW.admission_number IS DISTINCT FROM OLD.admission_number
    OR NEW.joined_at       IS DISTINCT FROM OLD.joined_at
    OR NEW.moved_out_at    IS DISTINCT FROM OLD.moved_out_at
    OR NEW.deleted_at      IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by      IS DISTINCT FROM OLD.deleted_by
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled columns on their own record';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_students_guard_self_update() FROM PUBLIC, anon;
