-- Parent Portal "Edit Profile": guardians_write_staff (FOR ALL) only grants
-- HOSTEL_ADMIN/WARDEN/SUPER_ADMIN write access to a guardians row — there was
-- no path for a parent to update their own row at all. This adds a scoped
-- self-update policy plus a guard trigger restricting which columns a
-- self-edit may touch: full_name/email/occupation/address only. `phone` is
-- deliberately excluded — it's the SSO identity anchor useResolvedRole()
-- matches against auth.users.phone to resolve the PARENT fallback role, and
-- is intentionally staff-only via updateGuardianPhone (audit-logged) for
-- that reason. tenant_id/profile_id/portal_access_enabled/status/deleted_at
-- are likewise staff-only.
CREATE POLICY guardians_self_update ON public.guardians FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_guardians_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_staff boolean;
BEGIN
  -- NULL auth.uid() = service-role/Edge Function context (e.g. the
  -- profile_id backfill in linkGuardianProfileOnLogin, which runs via
  -- supabaseAdmin at OTP-login time) — never a parent self-edit, so skip the
  -- restriction. Mirrors the auth.uid() IS NOT NULL guard added for
  -- students/agreements/gate_passes/complaints after the pg_cron
  -- SLA-scanner incident (see fn_is_acting_as_student_only).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_staff := public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), NEW.tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.has_tenant_role(auth.uid(), NEW.tenant_id, 'WARDEN'::app_role);

  IF NOT v_is_staff THEN
    IF NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
      OR NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Guardians may only self-edit name, email, occupation and address';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guardians_guard_self_update ON public.guardians;
CREATE TRIGGER trg_guardians_guard_self_update BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.fn_guardians_guard_self_update();
