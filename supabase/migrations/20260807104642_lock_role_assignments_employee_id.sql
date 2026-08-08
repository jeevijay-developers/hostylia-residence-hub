-- The existing "self activate role_assignments" UPDATE policy
-- (user_id = auth.uid(), no column restriction) would otherwise let a
-- client-side self-update overwrite employee_id, which must be permanently
-- read-only once assigned. Pin it on every UPDATE regardless of caller.
CREATE OR REPLACE FUNCTION public.fn_role_assignments_lock_employee_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.employee_id := OLD.employee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_assignments_lock_employee_id ON public.role_assignments;
CREATE TRIGGER trg_role_assignments_lock_employee_id
  BEFORE UPDATE ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_role_assignments_lock_employee_id();
