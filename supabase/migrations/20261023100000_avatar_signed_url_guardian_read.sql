-- Profile photos were broken for every role: the `avatars` storage bucket is
-- private (public = false), but every call site used getPublicUrl(), which
-- only ever produces a working URL for a genuinely public bucket — against a
-- private one it still returns a string, just one that 404s for every
-- viewer. The app-side fix (switching to createSignedUrl/createSignedUrls,
-- see src/lib/avatar.ts) is the main change; this migration closes one real
-- gap in can_read_profile_avatar() it surfaced along the way.
--
-- can_read_profile_avatar() already covers: self, Super Admin, Hostel Admin
-- (same tenant), Warden (property access to the student/staff), and other
-- staff in a shared property. It never covered a guardian reading their own
-- linked student's photo — parent/ComplaintCard.tsx already renders
-- `complaint.student_avatar_path` as an avatar (existing feature, not new),
-- so without this branch a Parent's signed-URL request for that path would
-- correctly return no photo under the new, properly-enforced RLS check, same
-- failure as before just for a different reason. Mirrors the same
-- `student_guardians` linkage check (is_guardian_of_student) already used
-- for complaints/notices/gate-pass parent-read policies — not gated on any
-- specific can_view_* flag, since seeing a photo is a lower bar than seeing
-- finance/attendance detail.
CREATE OR REPLACE FUNCTION public.can_read_profile_avatar(p_owner_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF p_owner_folder IS NULL
     OR p_owner_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_owner := p_owner_folder::uuid;

  IF v_owner = auth.uid() OR public.is_super_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  -- Hostel admin who shares a tenant with this profile. Same helper the
  -- existing admin policies use (has_tenant_role(..., 'HOSTEL_ADMIN')).
  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = v_owner
      AND s.deleted_at IS NULL
      AND public.has_tenant_role(auth.uid(), s.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) OR EXISTS (
    SELECT 1 FROM public.role_assignments ra
    WHERE ra.user_id = v_owner
      AND ra.is_active
      AND ra.revoked_at IS NULL
      AND public.has_tenant_role(auth.uid(), ra.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = v_owner
      AND tm.status = 'ACTIVE'
      AND public.has_tenant_role(auth.uid(), tm.tenant_id, 'HOSTEL_ADMIN'::public.app_role)
  ) THEN
    RETURN true;
  END IF;

  -- Warden with property access where this profile is a student or staff member.
  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = v_owner
      AND s.deleted_at IS NULL
      AND public.warden_can_read_property(auth.uid(), s.tenant_id, s.property_id)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.role_assignments staff
    WHERE staff.user_id = v_owner
      AND staff.is_active
      AND staff.revoked_at IS NULL
      AND staff.property_id IS NOT NULL
      AND staff.role IN (
        'HOSTEL_ADMIN'::public.app_role,
        'WARDEN'::public.app_role,
        'ACCOUNTANT'::public.app_role
      )
      AND public.warden_can_read_property(auth.uid(), staff.tenant_id, staff.property_id)
  ) THEN
    RETURN true;
  END IF;

  -- NEW: a guardian reading their own linked student's photo.
  RETURN EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = v_owner
      AND s.deleted_at IS NULL
      AND public.is_guardian_of_student(auth.uid(), s.id)
  );
END;
$function$;
