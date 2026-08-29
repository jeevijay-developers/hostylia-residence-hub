import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchNotification } from "@/lib/dispatch-notification";

export async function assertSuper(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("SUPER_ADMIN required");
}

export const getPlatformMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("fn_get_platform_metrics");
    if (error) throw error;
    return data as {
      mrr_paise: number;
      active_subscriptions: number;
      tenants_by_status: Record<string, number>;
      churn_30d: number;
      churned_count_30d: number;
    };
  });

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data, error } = await supabase
      .from("tenants")
      .select("id,display_name,slug,status,onboarding_status,created_at,suspended_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string; status: "ACTIVE" | "SUSPENDED" | "CANCELLED" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const patch: any = { status: data.status };
    if (data.status === "SUSPENDED") patch.suspended_at = new Date().toISOString();
    if (data.status === "CANCELLED") patch.cancelled_at = new Date().toISOString();
    if (data.status === "ACTIVE") {
      patch.suspended_at = null;
      patch.cancelled_at = null;
    }
    const { error } = await supabase.from("tenants").update(patch).eq("id", data.tenant_id);
    if (error) throw error;
    return { ok: true };
  });

export type SubscriptionWithPlan = {
  id: string;
  tenant_id: string;
  status: string;
  custom_price_paise: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  tenants: { display_name: string } | null;
  plans: { code: string; name: string; price_paise: number; billing_interval: string } | null;
};

export const listSubscriptionsWithPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id,tenant_id,status,custom_price_paise,current_period_start,current_period_end," +
          "trial_ends_at,cancel_at_period_end," +
          "tenants(display_name),plans(code,name,price_paise,billing_interval)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    // The generated Supabase types don't resolve this multi-embed select
    // cleanly (same "GenericStringError" class already present elsewhere in
    // this codebase for complex embedded selects) — the runtime shape is
    // correct (verified live), only the static type is unknown here.
    return (data ?? []) as unknown as SubscriptionWithPlan[];
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data, error } = await supabase
      .from("plans")
      .select("id,code,name,price_paise,billing_interval,trial_days,is_active")
      .order("price_paise", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

// Current subscription (if any) per tenant, keyed by tenant_id — used to
// pre-select the tenant's existing plan in the assign-subscription dialog.
export const listCurrentSubscriptionsByTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,tenant_id,plan_id,status,current_period_end,created_at")
      .in("status", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Keep only the most recent current-ish subscription per tenant.
    const byTenant = new Map<string, (typeof data)[number]>();
    for (const row of data ?? []) {
      if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, row);
    }
    return Object.fromEntries(byTenant);
  });

const assignSubscriptionSchema = z.object({
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  status: z.enum(["TRIAL", "ACTIVE"]).default("ACTIVE"),
  period_days: z.number().int().min(1).max(3650).default(30),
});

/**
 * Super-Admin-only manual override: assign or change a specific tenant's
 * subscription plan directly from the backend, independent of self-serve
 * checkout — e.g. a comped/custom plan, or a hostel that signed up without
 * picking one. Updates the tenant's current (TRIAL/ACTIVE/PAST_DUE/PAUSED)
 * subscription row if one exists, otherwise creates a new one. Gated by the
 * `subscriptions_write_super` RLS policy (is_super_admin only) in addition
 * to the explicit assertSuper check.
 */
export const assignTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => assignSubscriptionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("id,trial_days")
      .eq("id", data.plan_id)
      .single();
    if (planErr) throw planErr;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + data.period_days * 24 * 60 * 60 * 1000);
    // trial_days is NOT NULL (DB default 7 as of the trial-period-config
    // migration) — `?? 7` is defensive, matching that default, not a
    // behavior change for any existing plan row.
    const trialEnd =
      data.status === "TRIAL"
        ? new Date(now.getTime() + (plan.trial_days ?? 7) * 24 * 60 * 60 * 1000)
        : null;

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .in("status", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED"])
      .order("created_at", { ascending: false })
      .limit(1);

    const patch = {
      plan_id: data.plan_id,
      status: data.status,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: trialEnd ? trialEnd.toISOString() : null,
      provider: "MANUAL",
    };

    if (existing && existing.length > 0) {
      const { error } = await supabase.from("subscriptions").update(patch).eq("id", existing[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("subscriptions").insert({
        tenant_id: data.tenant_id,
        starts_at: now.toISOString(),
        ...patch,
      });
      if (error) throw error;
    }

    // audit_logs has no client-writable INSERT policy (even for super
    // admins) by design — only service-role can write it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenant_id,
      actor_user_id: userId,
      action: "SUBSCRIPTION_ASSIGNED_BY_SUPER_ADMIN",
      entity_type: "subscriptions",
      entity_id: data.tenant_id,
      after_data: patch,
    });

    return { ok: true };
  });

// -------- Feature flags --------
export const listTenantFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("tenant_id", data.tenant_id)
      .in("status", ["ACTIVE", "TRIAL"])
      .limit(1);
    const planId = sub?.[0]?.plan_id ?? null;
    const [{ data: planFeats }, { data: overrides }] = await Promise.all([
      planId
        ? supabase.from("plan_features").select("*").eq("plan_id", planId)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("tenant_feature_overrides").select("*").eq("tenant_id", data.tenant_id),
    ]);
    return { planFeatures: planFeats ?? [], overrides: overrides ?? [] };
  });

const overrideSchema = z.object({
  tenant_id: z.string().uuid(),
  feature_key: z.string().min(1),
  enabled: z.boolean(),
  limit_value: z.number().nullable().optional(),
  configuration: z.record(z.any()).optional(),
  reason: z.string().min(3),
  expires_at: z.string().datetime().nullable().optional(),
});

export const upsertFeatureOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { error } = await supabase.from("tenant_feature_overrides").upsert(
      {
        tenant_id: data.tenant_id,
        feature_key: data.feature_key,
        enabled: data.enabled,
        limit_value: data.limit_value ?? null,
        configuration: data.configuration ?? {},
        reason: data.reason,
        expires_at: data.expires_at ?? null,
        created_by: userId,
      },
      { onConflict: "tenant_id,feature_key" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const deleteFeatureOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { error } = await supabase.from("tenant_feature_overrides").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Impersonation / Support sessions --------
const startSessionSchema = z.object({
  tenant_id: z.string().uuid(),
  target_user_id: z.string().uuid(),
  reason: z.string().min(10),
  support_reference: z.string().nullable().optional(),
  access_mode: z.enum(["READ_ONLY", "STANDARD", "ELEVATED"]).default("READ_ONLY"),
  consent_recorded: z.literal(true),
  duration_minutes: z.number().int().min(5).max(60).default(30),
});

export const startSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => startSessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const now = new Date();
    const expires = new Date(now.getTime() + data.duration_minutes * 60_000);
    const { data: row, error } = await supabase
      .from("support_sessions")
      .insert({
        tenant_id: data.tenant_id,
        super_admin_user_id: userId,
        target_user_id: data.target_user_id,
        reason: data.reason,
        support_reference: data.support_reference ?? null,
        consent_recorded: data.consent_recorded,
        access_mode: data.access_mode,
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Notify target (in-app banner + notification) — dispatchNotification
    // never throws, so no try/catch needed to keep this best-effort.
    await dispatchNotification(supabase, {
      channel: "IN_APP",
      templateKey: "support_session_started",
      recipient: { userId: data.target_user_id },
      variables: {
        session_id: row.id,
        expires_at: row.expires_at,
        access_mode: data.access_mode,
        reason: data.reason,
      },
      eventType: "SUPPORT_SESSION_STARTED",
      tenantId: data.tenant_id,
      referenceId: row.id,
    });

    // Audit
    await supabase.from("audit_logs").insert({
      tenant_id: data.tenant_id,
      actor_user_id: userId,
      effective_user_id: data.target_user_id,
      support_session_id: row.id,
      action: "SUPPORT_SESSION_STARTED",
      entity_type: "support_sessions",
      entity_id: row.id,
      after_data: row,
    });

    return row;
  });

export const endSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { session_id: string; reason: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("fn_end_support_session", {
      _session_id: data.session_id,
      _reason: data.reason,
    });
    if (error) throw error;

    // Notify target of end
    await dispatchNotification(supabase, {
      channel: "IN_APP",
      templateKey: "support_session_ended",
      recipient: { userId: (row as any).target_user_id },
      variables: { session_id: data.session_id, reason: data.reason },
      eventType: "SUPPORT_SESSION_ENDED",
      tenantId: (row as any).tenant_id,
      referenceId: data.session_id,
    });
    return row;
  });

export const listSupportSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Policy filters by RLS (super admin sees all; target sees own)
    const { data, error } = await supabase
      .from("support_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const searchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { q: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const q = `%${data.q}%`;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id,full_name,email,phone")
      .or(`full_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
      .limit(20);
    if (error) throw error;
    return rows ?? [];
  });

// -------- Hostel Admin assignment (Tenants → Assign Hostel Admin) --------

/**
 * Existing HOSTEL_ADMIN role_assignments for a tenant, with profile +
 * property names resolved via the service-role client — `profiles`/
 * `properties` RLS already lets Super Admin read across tenants directly,
 * but `role_assignments` join targets (other users' names) still need the
 * same service-role lookup pattern `listStaff` (admin.staff.tsx's
 * equivalent) already uses.
 */
export const getTenantHostelAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data: rows, error } = await supabase
      .from("role_assignments")
      .select("id,user_id,property_id,granted_at")
      .eq("tenant_id", data.tenant_id)
      .eq("role", "HOSTEL_ADMIN")
      .eq("is_active", true)
      .order("granted_at", { ascending: false });
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const propertyIds = Array.from(
      new Set((rows ?? []).map((r) => r.property_id).filter((v): v is string => !!v)),
    );
    const [{ data: profiles }, { data: properties }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", userIds)
        : Promise.resolve({
            data: [] as { id: string; full_name: string; email: string | null }[],
          }),
      propertyIds.length
        ? supabase.from("properties").select("id,name").in("id", propertyIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const propmap = new Map((properties ?? []).map((p) => [p.id, p.name]));
    return (rows ?? []).map((r) => ({
      ...r,
      profile: pmap.get(r.user_id) ?? null,
      property_name: r.property_id ? (propmap.get(r.property_id) ?? null) : null,
    }));
  });

/**
 * Users who already belong to a tenant (via tenant_memberships) — the pool
 * Super Admin picks from to "assign an existing user belonging to the
 * tenant" as Hostel Admin. Deliberately tenant-scoped, unlike `searchUsers`
 * (global) — `tenant_memberships` has no Super-Admin-inclusive SELECT
 * policy (only "own row" / "HOSTEL_ADMIN of that tenant"), so this reads
 * via the service-role client rather than widening that RLS policy for a
 * single admin-panel dropdown.
 */
export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", data.tenant_id)
      .eq("status", "ACTIVE");
    if (error) throw error;
    const ids = Array.from(new Set((members ?? []).map((m) => m.user_id)));
    if (!ids.length) return [];
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", ids)
      .order("full_name");
    if (pErr) throw pErr;
    return profiles ?? [];
  });

const assignHostelAdminSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  property_id: z.string().uuid().nullable().optional(),
});

/**
 * Grants an existing user HOSTEL_ADMIN for a tenant. All authorization and
 * cross-tenant validation happens inside `fn_assign_hostel_admin` (a
 * SECURITY DEFINER Postgres function, not a raw client mutation) — the
 * `assertSuper` check here is defense-in-depth at the app layer, the real
 * boundary is the DB function's own `is_super_admin()` check.
 */
export const assignHostelAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => assignHostelAdminSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data: out, error } = await supabase.rpc("fn_assign_hostel_admin", {
      p_tenant_id: data.tenant_id,
      p_target_user_id: data.user_id,
      p_property_id: data.property_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return out as { role_assignment_id: string };
  });

// -------- Billing → tenant-specific custom price --------

const setCustomPriceSchema = z.object({
  subscription_id: z.string().uuid(),
  custom_price_paise: z.number().int().min(0).nullable(),
});

/**
 * Super-Admin-only override of a single subscription's effective price,
 * independent of the shared `plans.price_paise` row (never mutated here —
 * other tenants on the same plan are unaffected). `null` clears the override
 * and reverts the tenant to the standard plan price. Only `custom_price_paise`
 * is ever written — plan/status/period fields are untouched, so this can
 * never turn a TRIAL subscription into a paid one. Gated by the existing
 * `subscriptions_write_super` RLS policy (is_super_admin only) in addition to
 * the explicit assertSuper check, same as `assignTenantSubscription`.
 */
export const setTenantCustomPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => setCustomPriceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const { data: existing, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("id,tenant_id,custom_price_paise")
      .eq("id", data.subscription_id)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase
      .from("subscriptions")
      .update({ custom_price_paise: data.custom_price_paise })
      .eq("id", data.subscription_id);
    if (error) throw error;

    // audit_logs has no client-writable INSERT policy (even for super
    // admins) by design — only service-role can write it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: existing.tenant_id,
      actor_user_id: userId,
      action: "SUBSCRIPTION_CUSTOM_PRICE_CHANGED_BY_SUPER_ADMIN",
      entity_type: "subscriptions",
      entity_id: data.subscription_id,
      before_data: { custom_price_paise: existing.custom_price_paise },
      after_data: { custom_price_paise: data.custom_price_paise },
    });

    return { ok: true };
  });

// -------- Billing → 30-day churn details --------

const listChurnedTenantsSchema = z.object({
  plan_id: z.string().uuid().nullable().optional(),
  cancellation_reason: z.string().nullable().optional(),
  from: z.string().datetime().nullable().optional(),
  to: z.string().datetime().nullable().optional(),
});

/**
 * Tenants whose subscription was CANCELLED within the same 30-day window
 * `fn_get_platform_metrics()`'s `churn_30d`/`churned_count_30d` already use
 * (`status = 'CANCELLED' AND cancelled_at >= now() - 30 days`) — this is
 * deliberately the *same* definition, not a second one; `from`/`to` narrow
 * further within that window (or before it, for browsing older cohorts),
 * they don't redefine "churn". `subscription_cancellations` is left-joined
 * (not inner) so historical cancellations recorded before this feature
 * existed — which have no feedback row — still show up, feedback fields
 * simply null (rendered as "Not provided" in the UI, never faked).
 */
export const listChurnedTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => listChurnedTenantsSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const from = data.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("subscriptions")
      .select(
        "id,tenant_id,plan_id,status,starts_at,cancelled_at,custom_price_paise," +
          "tenants(display_name)," +
          "plans(name,price_paise,billing_interval)," +
          "subscription_cancellations(cancellation_reason,cancellation_reason_other,continue_in_future,additional_feedback,cancelled_at)",
      )
      .eq("status", "CANCELLED")
      .gte("cancelled_at", from)
      .order("cancelled_at", { ascending: false })
      .limit(500);

    if (data.to) query = query.lte("cancelled_at", data.to);
    if (data.plan_id) query = query.eq("plan_id", data.plan_id);

    const { data: rows, error } = await query;
    if (error) throw error;

    // The generated Supabase types don't resolve this reverse-FK embed
    // (subscription_cancellations.subscription_id -> subscriptions.id)
    // cleanly, matching the same "GenericStringError" class already present
    // elsewhere in this codebase for complex embedded selects — the runtime
    // shape is correct (verified live), only the static type is unknown here.
    type ChurnRow = {
      subscription_cancellations: { cancellation_reason: string }[] | null;
    };
    const typedRows = (rows ?? []) as unknown as ChurnRow[];

    const filtered = data.cancellation_reason
      ? typedRows.filter(
          (r) =>
            r.subscription_cancellations?.[0]?.cancellation_reason === data.cancellation_reason,
        )
      : typedRows;

    return filtered;
  });

// -------- Plans → trial period configuration --------

const updateTrialDaysSchema = z.object({
  plan_id: z.string().uuid(),
  trial_days: z.number().int().min(0),
});

/**
 * Super-Admin-only: configure how many trial days a plan grants (Starter,
 * Professional, Enterprise, ...). Reused everywhere a trial is started —
 * `fn_provision_tenant` (self-serve signup) and `assignTenantSubscription`
 * (manual Super Admin assignment) both already compute
 * `trial_end = trial_start + plan.trial_days` dynamically, so this only ever
 * needs to change the one `plans.trial_days` value; no trial-calculation
 * logic lives here or anywhere else. Only `trial_days` is written — price,
 * billing interval, and every other plan field are untouched. Gated by the
 * existing `plans_write_super` RLS policy (is_super_admin only, same policy
 * `assignTenantSubscription`'s plan reads and `setTenantCustomPrice` rely on
 * elsewhere) in addition to the explicit assertSuper check.
 */
export const updatePlanTrialDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateTrialDaysSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const { data: existing, error: fetchErr } = await supabase
      .from("plans")
      .select("id,name,trial_days")
      .eq("id", data.plan_id)
      .single();
    if (fetchErr) throw fetchErr;

    const { error: updateErr } = await supabase
      .from("plans")
      .update({ trial_days: data.trial_days })
      .eq("id", data.plan_id);
    if (updateErr) throw updateErr;

    // audit_logs has no client-writable INSERT policy (even for super
    // admins) by design — only service-role can write it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "PLAN_TRIAL_DAYS_CHANGED_BY_SUPER_ADMIN",
      entity_type: "plans",
      entity_id: data.plan_id,
      before_data: { trial_days: existing.trial_days },
      after_data: { trial_days: data.trial_days },
    });

    return { ok: true };
  });

export const createHostelSchema = z.object({
  hostelName: z.string().min(1, "Required"),
  slug: z.string().min(1, "Required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contactPhone: z.string().optional(),
  adminName: z.string().min(1, "Required"),
  adminEmail: z.string().email("Invalid email"),
  adminPhone: z.string().optional(),
  planId: z.string().min(1, "Required"),
  status: z.enum(["ACTIVE", "TRIAL"]).default("ACTIVE"),
});

export const createHostelWithAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof createHostelSchema>) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Create Tenant
    const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
      display_name: data.hostelName,
      slug: data.slug.toLowerCase(),
      status: "ACTIVE",
      onboarding_status: "COMPLETED",
    }).select().single();
    if (tErr) throw new Error("Could not create tenant: " + tErr.message);

    // 2. Create Organization
    const { data: org, error: orgErr } = await supabase.from("organizations").insert({
      tenant_id: tenant.id,
      name: data.hostelName,
      billing_phone: data.contactPhone,
      status: "ACTIVE",
    }).select().single();
    if (orgErr) throw new Error("Could not create organization: " + orgErr.message);

    // 3. Create Property
    const { error: pErr } = await supabase.from("properties").insert({
      tenant_id: tenant.id,
      organization_id: org.id,
      name: data.hostelName,
      slug: data.slug.toLowerCase(),
      address_line_1: data.address || "",
      city: data.city || "",
      state: data.state || "",
      phone: data.contactPhone,
      postal_code: "",
    });
    if (pErr) throw new Error("Could not create property: " + pErr.message);

    // 4. Assign Subscription
    const planRes = await supabase.from("plans").select("trial_days").eq("id", data.planId).single();
    const trialDays = planRes.data?.trial_days ?? 7;
    const now = new Date();
    const trialEnd = data.status === "TRIAL" ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null;
    
    const { error: subErr } = await supabase.from("subscriptions").insert({
      tenant_id: tenant.id,
      plan_id: data.planId,
      status: data.status,
      starts_at: now.toISOString(),
      current_period_start: now.toISOString(),
      trial_ends_at: trialEnd ? trialEnd.toISOString() : null,
      provider: "MANUAL",
    });
    if (subErr) throw new Error("Could not assign subscription: " + subErr.message);

    // 5. Create Auth User Placeholder (No password, email_confirm: false)
    const { data: createdUser, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      phone: data.adminPhone || undefined,
      email_confirm: false,
      phone_confirm: false,
      user_metadata: {
        full_name: data.adminName,
        invited_role: "HOSTEL_ADMIN",
        invited_tenant: tenant.id,
      }
    });
    if (uErr) throw new Error("Could not create admin user: " + uErr.message);

    const inviteeId = createdUser.user?.id;
    if (!inviteeId) throw new Error("Failed to create admin user");

    // 6. Insert tenant membership as INVITED
    const nowIso = now.toISOString();
    const { error: mErr } = await supabaseAdmin.from("tenant_memberships").insert({
      tenant_id: tenant.id,
      user_id: inviteeId,
      status: "INVITED",
      invited_by: userId,
      invited_at: nowIso,
    });
    if (mErr) throw new Error("Membership failed: " + mErr.message);

    // 7. Insert role assignment as pending
    const { error: rErr } = await supabaseAdmin.from("role_assignments").insert({
      tenant_id: tenant.id,
      user_id: inviteeId,
      role: "HOSTEL_ADMIN",
      is_active: false,
      granted_by: userId,
      granted_at: nowIso,
      permissions: {},
    });
    if (rErr) throw new Error("Role assignment failed: " + rErr.message);

    // 8. Generate Setup URL and Dispatch Notification
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    let setupUrl = `${appUrl}/reset-password`;
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.adminEmail,
        options: { redirectTo: `${appUrl}/reset-password` },
      });
      const actionLink = (linkData as any)?.properties?.action_link;
      if (actionLink) setupUrl = String(actionLink);
    } catch (e) {
      // Best effort
    }

    const inviteDate = now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const variables = {
      role: "Hostel Admin",
      invitee_name: data.adminName,
      hostel_name: data.hostelName,
      invite_date: inviteDate,
      setup_url: setupUrl,
      expiry_days: "7",
      year: now.getFullYear().toString(),
    };

    const notifyRes = await dispatchNotification(supabase, {
      channel: "EMAIL",
      templateKey: "staff_invite",
      recipient: { email: data.adminEmail },
      variables,
      eventType: "STAFF_INVITE",
      tenantId: tenant.id,
    });

    if (!notifyRes.ok) {
      console.warn("Email invite failed:", notifyRes.message);
    }

    return { ok: true, tenant_id: tenant.id };
  });
