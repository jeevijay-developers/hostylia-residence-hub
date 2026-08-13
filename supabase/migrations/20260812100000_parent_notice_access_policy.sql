-- Parent notices access was previously routed only through
-- "notices read published in tenant" (tenant_memberships-based) and
-- "notices author or admin manage" — neither of which a Parent/Guardian
-- account can ever satisfy: role resolution for PARENT is done purely via
-- guardians.phone matching in useResolvedRole() (src/lib/user-role.ts) and
-- the guardian-linking flow (src/lib/guardian.functions.ts) never inserts a
-- tenant_memberships row for the guardian's profile — unlike the analogous
-- student-linking flow (src/lib/student.functions.ts), which explicitly
-- upserts one. Net effect: useTenantNotices() (src/lib/notifications.ts)
-- silently returned zero rows for every real parent, regardless of how many
-- published notices existed for their child's property.
--
-- Fix: grant SELECT through the Parent -> linked Student -> Property
-- relationship instead, reusing the existing is_guardian_of_property()
-- SECURITY DEFINER helper (see 20260725083403_fix_students_rls_recursion.sql)
-- so this can't reintroduce the student_guardians/students RLS recursion
-- that helper was built to avoid. Scoped to PUBLISHED, non-deleted notices
-- whose audience includes parents (ALL/PARENTS) and only for properties the
-- guardian has an active (unlinked_at IS NULL) link into — tenant/property
-- isolation holds because is_guardian_of_property() matches on
-- notices.property_id, and a property belongs to exactly one tenant.
--
-- This is purely additive: the existing tenant-member/author/admin SELECT
-- policies are untouched, so Student/Warden/Admin notice access is unaffected.
CREATE POLICY "notices read by linked parent" ON public.notices
  FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'
    AND deleted_at IS NULL
    AND audience_type IN ('ALL', 'PARENTS')
    AND public.is_guardian_of_property(auth.uid(), property_id)
  );
