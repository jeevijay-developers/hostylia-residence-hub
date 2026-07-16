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
  .inputValidator((d: { tenant_id: string; status: "ACTIVE" | "SUSPENDED" | "CANCELLED" }) => d)
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

// -------- Feature flags --------
export const listTenantFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string }) => d)
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
  .inputValidator((d) => overrideSchema.parse(d))
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
  .inputValidator((d: { id: string }) => d)
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
  .inputValidator((d) => startSessionSchema.parse(d))
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
  .inputValidator((d: { session_id: string; reason: string }) => d)
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
  .inputValidator((d: { q: string }) => d)
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
