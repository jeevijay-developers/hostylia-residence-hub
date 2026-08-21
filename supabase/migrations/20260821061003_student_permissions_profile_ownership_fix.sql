-- Fix a regression in 20260821060645_student_module_permissions.sql:
-- can_student_view_profile/can_student_edit_profile used is_own_student()
-- (which excludes soft-deleted students via deleted_at IS NULL), but the
-- original "students self read"/"agreements student read"/"allocations
-- student read"/"documents student self read" policies had NO deleted_at
-- filter — profile_id = auth.uid() alone. Switch to is_owning_student()
-- (no deleted_at check) to exactly preserve prior behavior; only the new
-- permission gate should be able to change access, not an incidental
-- ownership-check swap.
CREATE OR REPLACE FUNCTION public.can_student_view_profile(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_profile_view', true);
$$;
CREATE OR REPLACE FUNCTION public.can_student_edit_profile(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owning_student(_user_id, _student_id)
     AND public.has_student_permission_for_user(_user_id, 'student_profile_edit', true);
$$;
