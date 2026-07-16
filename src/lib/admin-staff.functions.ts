import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid().nullable().optional(),
  block_id: z.string().uuid().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().min(6).nullable().optional(),
  role: z.enum(["WARDEN", "ACCOUNTANT"]),
});

async function assertAdmin(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase.rpc("has_tenant_role", {
    _user_id: userId,
    _tenant_id: tenantId,
    _role: "HOSTEL_ADMIN",
  });
  if (error) throw error;
  if (!data) throw new Error("Only HOSTEL_ADMIN can manage staff");
}

/**
 * Invite Warden/Accountant. Creates INVITED tenant_membership and
 * inactive role_assignment. Activation happens on first sign-in
 * (server function `activateStaffAssignments` — call from post-auth
 * flow when a user's email/phone matches an INVITED membership).
 */
export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.email && !data.phone) throw new Error("email or phone required");
    await assertAdmin(supabase, userId, data.tenant_id);

    // Resolve invitee by email/phone (may not exist yet)
    let inviteeId: string | null = null;
    if (data.email) {
      const { data: p } = await supabase.from("profiles").select("id").eq("email", data.email).limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }
    if (!inviteeId && data.phone) {
      const { data: p } = await supabase.from("profiles").select("id").eq("phone", data.phone).limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }

    if (!inviteeId) {
      // Store pending invite via admin (needs to insert a role_assignments row we can flip later).
      // Requires a real user_id, so we create a placeholder profile via admin client.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email ?? undefined,
        phone: data.phone ?? undefined,
        email_confirm: false,
        phone_confirm: false,
        user_metadata: { invited_role: data.role, invited_tenant: data.tenant_id },
      });
      if (cErr) throw cErr;
      inviteeId = created.user?.id ?? null;
      if (!inviteeId) throw new Error("could not create invitee");
    }

    // tenant_memberships (INVITED)
    const { error: mErr } = await supabase.from("tenant_memberships").upsert(
      {
        tenant_id: data.tenant_id,
        user_id: inviteeId,
        status: "INVITED",
        invited_by: userId,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw mErr;

    // role_assignments (inactive until first sign-in)
    const { data: ra, error: rErr } = await supabase
      .from("role_assignments")
      .insert({
        tenant_id: data.tenant_id,
        user_id: inviteeId,
        role: data.role,
        property_id: data.property_id ?? null,
        block_id: data.block_id ?? null,
        is_active: false,
        granted_by: userId,
        granted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (rErr) throw rErr;

    // Fire invite notification (IN_APP always; email/sms if configured)
    try {
      await supabase.functions.invoke("send-notification", {
        body: {
          tenant_id: data.tenant_id,
          property_id: data.property_id ?? null,
          recipient_user_id: inviteeId,
          event_type: "STAFF_INVITE",
          template_key: "staff_invite",
          channels: ["IN_APP", data.email ? "EMAIL" : "SMS"],
          payload: { role: data.role },
          idempotency_key: `staff_invite:${ra.id}`,
        },
      });
    } catch {
      /* delivery is best-effort */
    }

    return { role_assignment_id: ra.id, invitee_id: inviteeId };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);
    const { data: rows, error } = await supabase
      .from("role_assignments")
      .select("id,user_id,role,property_id,block_id,is_active,granted_at,revoked_at")
      .eq("tenant_id", data.tenant_id)
      .in("role", ["WARDEN", "ACCOUNTANT", "HOSTEL_ADMIN"])
      .order("granted_at", { ascending: false });
    if (error) throw error;

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null }));
  });

export const revokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; role_assignment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);
    const { error } = await supabase
      .from("role_assignments")
      .update({ is_active: false, revoked_by: userId, revoked_at: new Date().toISOString() })
      .eq("id", data.role_assignment_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Activates any INVITED memberships + inactive role_assignments for the
 * current user (called from post-login). Idempotent.
 */
export const activateMyInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    await supabase
      .from("tenant_memberships")
      .update({ status: "ACTIVE", joined_at: nowIso })
      .eq("user_id", userId)
      .eq("status", "INVITED");
    await supabase
      .from("role_assignments")
      .update({ is_active: true })
      .eq("user_id", userId)
      .eq("is_active", false)
      .is("revoked_at", null);
    return { ok: true };
  });

// ---------- Settings ----------
const propSettingsSchema = z.object({
  property_id: z.string().uuid(),
  settings: z.record(z.any()),
});

export const updatePropertySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => propSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop } = await supabase
      .from("properties")
      .select("tenant_id,settings")
      .eq("id", data.property_id)
      .single();
    if (!prop) throw new Error("property not found");
    await assertAdmin(supabase, userId, prop.tenant_id);
    const merged = { ...(prop.settings ?? {}), ...data.settings };
    const { error } = await supabase
      .from("properties")
      .update({ settings: merged })
      .eq("id", data.property_id);
    if (error) throw error;
    return { ok: true, settings: merged };
  });

const orgSchema = z.object({
  organization_id: z.string().uuid(),
  legal_name: z.string().nullable().optional(),
  gstin: z.string().nullable().optional(),
  billing_email: z.string().email().nullable().optional(),
  billing_phone: z.string().nullable().optional(),
  registered_address: z.record(z.any()).nullable().optional(),
});

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: org } = await supabase
      .from("organizations")
      .select("tenant_id")
      .eq("id", data.organization_id)
      .single();
    if (!org) throw new Error("org not found");
    await assertAdmin(supabase, userId, org.tenant_id);
    const { organization_id, ...patch } = data;
    const { error } = await supabase.from("organizations").update(patch).eq("id", organization_id);
    if (error) throw error;
    return { ok: true };
  });
