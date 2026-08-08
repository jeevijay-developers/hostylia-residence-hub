-- Supabase's linter flags trigger functions with a mutable search_path as a
-- security risk (a malicious search_path could shadow public.role_assignments'
-- referenced objects). Both employee_id trigger functions only touch
-- unqualified columns on the triggering row, so pinning search_path is a
-- pure hardening change with no behavior difference.
CREATE OR REPLACE FUNCTION public.fn_role_assignments_set_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  prefix := CASE NEW.role
    WHEN 'WARDEN' THEN 'WRD'
    WHEN 'ACCOUNTANT' THEN 'ACC'
    WHEN 'HOSTEL_ADMIN' THEN 'ADM'
    ELSE 'STF'
  END;
  NEW.employee_id := prefix || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_role_assignments_lock_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.employee_id := OLD.employee_id;
  RETURN NEW;
END;
$$;
