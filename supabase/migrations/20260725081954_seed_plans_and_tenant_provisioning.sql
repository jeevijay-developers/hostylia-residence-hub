-- Seed default plans (mirrors marketing site pricing.tsx tiers) so new
-- tenants have a plan to attach to at signup, and Super Admin has real
-- options to assign from the console.
INSERT INTO public.plans (code, name, description, billing_interval, price_paise, trial_days, max_properties, max_staff_seats, is_active)
VALUES
  ('STARTER', 'Starter', 'For single hostels getting started.', 'MONTHLY', 11500, 14, 1, 5, true),
  ('PROFESSIONAL', 'Professional', 'For growing properties and small chains.', 'MONTHLY', 14000, 14, 5, 20, true),
  ('ENTERPRISE', 'Enterprise', 'For multi-property owners and institutions.', 'CUSTOM', 0, 0, NULL, NULL, true)
ON CONFLICT (code) DO NOTHING;

-- ============ fn_provision_tenant ============
-- Self-serve tenant provisioning for a Hostel Admin signup. SECURITY DEFINER
-- so it can write tenants/organizations/subscriptions/role_assignments/
-- tenant_memberships in one transaction despite those tables having no
-- direct INSERT policy for `authenticated` (tenant creation is deliberately
-- privileged — see tenants_insert_super policy). Identity comes from
-- auth.uid() only, never a client-supplied user id. Idempotent: if the
-- caller already has an active HOSTEL_ADMIN assignment, returns that
-- tenant instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.fn_provision_tenant(p_hostel_name text)
RETURNS TABLE(tenant_id uuid, already_existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_tenant_id uuid;
  v_tenant_id uuid;
  v_plan_id uuid;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ra.tenant_id INTO v_existing_tenant_id
  FROM public.role_assignments ra
  WHERE ra.user_id = v_user_id AND ra.role = 'HOSTEL_ADMIN' AND ra.is_active = true
  LIMIT 1;

  IF v_existing_tenant_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_tenant_id, true;
    RETURN;
  END IF;

  IF p_hostel_name IS NULL OR btrim(p_hostel_name) = '' THEN
    RAISE EXCEPTION 'hostel_name is required';
  END IF;

  v_base_slug := lower(regexp_replace(btrim(p_hostel_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug = '' THEN v_base_slug := 'hostel'; END IF;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  END LOOP;

  SELECT id INTO v_plan_id FROM public.plans WHERE is_active = true ORDER BY price_paise ASC NULLS LAST LIMIT 1;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No active plan configured — contact support';
  END IF;

  INSERT INTO public.tenants (slug, display_name, status, onboarding_status)
  VALUES (v_slug, p_hostel_name, 'TRIAL', 'IN_PROGRESS')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.organizations (tenant_id, name)
  VALUES (v_tenant_id, p_hostel_name);

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, starts_at, trial_ends_at, current_period_start, current_period_end)
  SELECT v_tenant_id, p.id, 'TRIAL', now(), now() + (p.trial_days || ' days')::interval,
         now(), now() + (p.trial_days || ' days')::interval
  FROM public.plans p WHERE p.id = v_plan_id;

  INSERT INTO public.role_assignments (tenant_id, user_id, role, is_active, granted_at)
  VALUES (v_tenant_id, v_user_id, 'HOSTEL_ADMIN', true, now());

  INSERT INTO public.tenant_memberships (tenant_id, user_id, status, joined_at)
  VALUES (v_tenant_id, v_user_id, 'ACTIVE', now());

  RETURN QUERY SELECT v_tenant_id, false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_provision_tenant(text) TO authenticated, service_role;
