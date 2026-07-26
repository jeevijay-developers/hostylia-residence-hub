import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
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

export const listSubscriptionsWithPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,tenant_id,status,current_period_end,plans(code,name,price_paise,billing_interval)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
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
    const trialEnd =
      data.status === "TRIAL" ? new Date(now.getTime() + (plan.trial_days ?? 0) * 24 * 60 * 60 * 1000) : null;

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
      .in("status", ["ACTIVE", "TRIALING"])
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

    // Notify target (in-app banner + notification)
    try {
      await supabase.functions.invoke("send-notification", {
        body: {
          channel: "IN_APP",
          templateKey: "support_session_started",
          recipient: { userId: data.target_user_id },
          variables: { session_id: row.id, expires_at: row.expires_at, access_mode: data.access_mode, reason: data.reason },
          eventType: "SUPPORT_SESSION_STARTED",
          tenantId: data.tenant_id,
          referenceId: row.id,
        },
      });
    } catch { /* best-effort */ }

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
    try {
      await supabase.functions.invoke("send-notification", {
        body: {
          channel: "IN_APP",
          templateKey: "support_session_ended",
          recipient: { userId: (row as any).target_user_id },
          variables: { session_id: data.session_id, reason: data.reason },
          eventType: "SUPPORT_SESSION_ENDED",
          tenantId: (row as any).tenant_id,
          referenceId: data.session_id,
        },
      });
    } catch { /* best-effort */ }
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
