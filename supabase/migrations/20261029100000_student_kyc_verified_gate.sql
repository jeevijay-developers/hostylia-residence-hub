-- Student KYC gate: until a student's KYC is VERIFIED, every student-facing
-- module except Profile (which holds KYC upload itself) is blocked at the
-- database, not just hidden in the UI.
--
-- "Verified" mirrors the existing KycStatus / student.profile KycOverallBadge
-- definition: the student's latest active record has at least one non-deleted
-- STUDENT-owned document and every one of them has verification_status =
-- 'VERIFIED'. A pending, rejected or missing document therefore keeps the gate
-- closed; the moment the warden/admin approves the last document the gate
-- opens with no further action.
--
-- Non-students (no active students row for the profile: staff, parents,
-- admins) are always "verified" so this helper is safe to AND into policies
-- that also serve those readers (notices, mess menus, notifications).
--
-- Enforcement point: the existing can_student_view_* / can_student_edit_*
-- functions (20260821060645_student_module_permissions.sql) that every
-- student-self RLS policy already routes through. Profile functions are
-- intentionally NOT changed — My Profile / KYC upload must stay reachable.
-- Policies themselves are untouched; only the functions they call change.

CREATE OR REPLACE FUNCTION public.is_student_kyc_verified(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT id FROM public.students
    WHERE profile_id = _user_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM s) THEN true
    ELSE
      EXISTS (
        SELECT 1 FROM public.documents d JOIN s ON s.id = d.owner_id
        WHERE d.owner_type = 'STUDENT' AND d.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.documents d JOIN s ON s.id = d.owner_id
        WHERE d.owner_type = 'STUDENT' AND d.deleted_at IS NULL
          AND d.verification_status <> 'VERIFIED'
      )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_student_kyc_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_kyc_verified(uuid) TO authenticated, service_role;

-- Attendance (read-only)
CREATE OR REPLACE FUNCTION public.can_student_view_attendance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_attendance_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- Complaints
CREATE OR REPLACE FUNCTION public.can_student_view_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_complaints_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_complaints(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_complaints_edit', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- Notices (tenant-wide; also evaluated for staff/parent readers, who pass
-- is_student_kyc_verified by not being students)
CREATE OR REPLACE FUNCTION public.can_student_view_notices(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_student_permission_for_user(_user_id, 'student_notices_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- Finance
CREATE OR REPLACE FUNCTION public.can_student_view_finance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_finance_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_finance(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_finance_edit', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- Gate Pass
CREATE OR REPLACE FUNCTION public.can_student_view_gate_passes(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_gate_passes_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_gate_passes(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_gate_passes_edit', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- Mess
CREATE OR REPLACE FUNCTION public.can_student_view_mess(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_student_permission_for_user(_user_id, 'student_mess_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.can_student_view_mess_feedback(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_mess_view', true)
     AND public.is_student_kyc_verified(_user_id);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_mess(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_mess_edit', true)
     AND public.is_student_kyc_verified(_user_id);
$$;

-- In-app notifications carry the same protected content (notice title/body,
-- fee reminders, complaint updates) as the modules above, so an unverified
-- student must not be able to read them directly either.
DROP POLICY "notifications recipient read" ON public.notifications;
CREATE POLICY "notifications recipient read" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() AND public.is_student_kyc_verified(auth.uid()));
