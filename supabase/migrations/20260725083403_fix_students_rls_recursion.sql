-- Fix "infinite recursion detected in policy for relation students":
-- student_guardians_select_scoped did a raw subquery into `students`, and
-- students' "students parent read" policy did a raw subquery back into
-- student_guardians/guardians — a genuine circular RLS dependency. Route
-- both through SECURITY DEFINER helpers (same pattern as has_tenant_role /
-- is_super_admin / warden_can_read_property elsewhere in this schema),
-- which bypass RLS internally and can't re-trigger the calling policy set.
-- Also applied to the equivalent properties_select_student/_parent
-- policies, which had the same raw-subquery shape and risk.

CREATE OR REPLACE FUNCTION public.is_own_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = _student_id AND profile_id = _user_id AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guardian_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_own_student_property(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE property_id = _property_id AND profile_id = _user_id AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_guardian_of_property(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    JOIN public.students s ON s.id = sg.student_id
    WHERE s.property_id = _property_id AND sg.unlinked_at IS NULL
      AND g.profile_id = _user_id AND g.deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_own_student(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_student(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_student_property(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_property(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "students parent read" ON public.students;
CREATE POLICY "students parent read" ON public.students
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_student(auth.uid(), id));

DROP POLICY IF EXISTS student_guardians_select_scoped ON public.student_guardians;
CREATE POLICY student_guardians_select_scoped ON public.student_guardians
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR has_any_tenant_role(auth.uid(), tenant_id)
    OR public.is_own_student(auth.uid(), student_id)
    OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = student_guardians.guardian_id AND g.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS properties_select_student ON public.properties;
CREATE POLICY properties_select_student ON public.properties
  FOR SELECT TO authenticated
  USING (public.is_own_student_property(auth.uid(), id));

DROP POLICY IF EXISTS properties_select_parent ON public.properties;
CREATE POLICY properties_select_parent ON public.properties
  FOR SELECT TO authenticated
  USING (public.is_guardian_of_property(auth.uid(), id));
