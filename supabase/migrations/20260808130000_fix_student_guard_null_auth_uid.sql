-- fn_is_acting_as_student_only(_tenant) currently returns:
--   NOT (is_super_admin(auth.uid()) OR has_any_tenant_role(auth.uid(), _tenant))
-- which evaluates TRUE when auth.uid() IS NULL — i.e. every service-role,
-- Edge Function, and pg_cron context, since none of those have a JWT session.
-- The four self-update guard triggers built on top of it (complaints, students,
-- agreements, gate_passes) then reject those writes as "a student editing
-- staff-only columns", even though a NULL auth.uid() can never legitimately be
-- a student — every "* student self *" RLS policy already requires
-- `s.profile_id = auth.uid()`, which is unsatisfiable when auth.uid() is NULL.
--
-- Concretely this has been silently breaking the SLA-breach scanner since it
-- was scheduled: `complaint-sla-scan` has failed 100% of its 751 runs so far
-- with "Students may not modify staff-controlled complaint columns", because
-- fn_scan_complaint_sla_breaches() runs from pg_cron (auth.uid() IS NULL) and
-- its own UPDATE ... SET sla_breached_at trips this guard. Same latent bug
-- would hit any future service-side write to students/agreements/gate_passes.

CREATE OR REPLACE FUNCTION public.fn_is_acting_as_student_only(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT (
    public.is_super_admin(auth.uid())
    OR public.has_any_tenant_role(auth.uid(), _tenant)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_is_acting_as_student_only(uuid) FROM PUBLIC, anon;
