-- Per-staff-member custom permission overrides (Admin > Staff "Customize
-- Permissions"). Lets a Hostel Admin grant/revoke individual feature access
-- for a specific Warden/Accountant on top of their role's default access —
-- e.g. give one Warden Finance access without changing the WARDEN role
-- default for everyone else.
--
-- `permissions` is a small jsonb bag of explicit boolean overrides keyed by
-- feature. Absence of a key (the default `{}`) means "use the role's normal
-- default" — nothing changes for any existing staff member. Only 'finance'
-- is a recognized key today (the only feature area with real Accountant-vs-
-- Warden divergence in the schema); the check constraint below is the single
-- place to widen that list later.
ALTER TABLE public.role_assignments
  ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Postgres CHECK constraints can't contain subqueries, so this is expressed
-- via jsonb operators instead of jsonb_each(): strip the one recognized key
-- and require nothing is left over, then require that key (if present) is a
-- boolean.
ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (permissions - 'finance') = '{}'::jsonb
    AND (NOT (permissions ? 'finance') OR jsonb_typeof(permissions -> 'finance') = 'boolean')
  );

COMMENT ON COLUMN public.role_assignments.permissions IS
  'Per-staff-member feature overrides, e.g. {"finance": true}. Empty object = use role default. Enforced in is_finance_staff().';

-- Re-point the single finance choke-point (used by every finance RLS policy
-- and the atomic payment/activation functions) through the override: an
-- explicit permissions.finance = true grants access regardless of role
-- (e.g. Warden); an explicit permissions.finance = false revokes it from a
-- role that would otherwise have it (Accountant/Hostel Admin). No override
-- present (the default `{}`) falls through to the original role check, so
-- every existing staff member's access is unchanged.
CREATE OR REPLACE FUNCTION public.is_finance_staff(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND is_active = true
      AND (property_id IS NULL OR property_id = _property_id)
      AND (
        (permissions ->> 'finance') = 'true'
        OR (
          role IN ('ACCOUNTANT'::app_role, 'HOSTEL_ADMIN'::app_role)
          AND (permissions ->> 'finance') IS DISTINCT FROM 'false'
        )
      )
  );
$$;
