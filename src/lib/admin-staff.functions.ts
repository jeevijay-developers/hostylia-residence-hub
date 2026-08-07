import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone } from "@/schemas/auth";

const inviteSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid().nullable().optional(),
  block_id: z.string().uuid().nullable().optional(),
  full_name: z.string().trim().min(2).max(120).nullable().optional(),
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
  .validator((d) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.email && !data.phone) throw new Error("email or phone required");
    await assertAdmin(supabase, userId, data.tenant_id);

    // Login matches auth.users.phone by exact string — a bare 10-digit
    // number stored here would silently never match "+91…" typed at sign-in.
    const phone = data.phone ? normalizeIndianPhone(data.phone) : null;

    // Resolve invitee by email/phone (may not exist yet). `profiles` RLS only
    // allows reading your own row, so looking up someone else's by contact
    // info needs the service-role client, not the request-scoped `supabase`.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let inviteeId: string | null = null;
    if (data.email) {
      const { data: p } = await supabaseAdmin.from("profiles").select("id").eq("email", data.email).limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }
    if (!inviteeId && phone) {
      const { data: p } = await supabaseAdmin.from("profiles").select("id").eq("phone", phone).limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }

    // Reusing an existing (e.g. orphaned/partial-invite/test) profile skips
    // the createUser call below, which is the only place full_name otherwise
    // gets set — so the name the admin just typed here would silently be
    // dropped in favor of whatever (often garbage, from earlier testing)
    // name the shell profile already had. The admin typing a name in this
    // form is a deliberate act — it should always win.
    if (inviteeId && data.full_name) {
      await supabaseAdmin.from("profiles").update({ full_name: data.full_name }).eq("id", inviteeId);
    }

    if (!inviteeId) {
      // Store pending invite via admin (needs to insert a role_assignments row we can flip later).
      // Requires a real user_id, so we create a placeholder profile via admin client.
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email ?? undefined,
        phone: phone ?? undefined,
        email_confirm: false,
        phone_confirm: false,
        user_metadata: {
          full_name: data.full_name ?? undefined,
          invited_role: data.role,
          invited_tenant: data.tenant_id,
        },
      });
      if (cErr) throw cErr;
      inviteeId = created.user?.id ?? null;
      if (!inviteeId) throw new Error("could not create invitee");
    }

    // tenant_memberships — active immediately. This is an admin adding a
    // known person (not a formal invite-then-accept flow), and unlike a
    // self-service signup there's no "prove you own this contact" step to
    // wait for, so gating on a fragile self-activate-at-first-login round
    // trip (activateMyInvites) only added a way for this to silently never
    // finish. Students get the same treatment via confirmStudentAdmission.
    const nowIso = new Date().toISOString();
    const { error: mErr } = await supabase.from("tenant_memberships").upsert(
      {
        tenant_id: data.tenant_id,
        user_id: inviteeId,
        status: "ACTIVE",
        invited_by: userId,
        invited_at: nowIso,
        joined_at: nowIso,
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw mErr;

    // role_assignments — active immediately, same reasoning.
    const { data: ra, error: rErr } = await supabase
      .from("role_assignments")
      .insert({
        tenant_id: data.tenant_id,
        user_id: inviteeId,
        role: data.role,
        property_id: data.property_id ?? null,
        block_id: data.block_id ?? null,
        is_active: true,
        granted_by: userId,
        granted_at: nowIso,
      })
      .select()
      .single();
    if (rErr) throw rErr;

    // Fire invite notification (IN_APP + email/SMS if configured); best-effort.
    const channels: Array<"IN_APP" | "EMAIL" | "SMS"> = ["IN_APP", data.email ? "EMAIL" : "SMS"];
    for (const ch of channels) {
      const recipient: Record<string, string | undefined> = {};
      if (ch === "IN_APP") recipient.userId = inviteeId;
      if (ch === "EMAIL") recipient.email = data.email ?? undefined;
      if (ch === "SMS") recipient.phone = phone ?? undefined;
      if (!recipient.userId && !recipient.email && !recipient.phone) continue;
      try {
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: ch,
            templateKey: "staff_invite",
            recipient,
            variables: { role: data.role },
            eventType: "STAFF_INVITE",
            tenantId: data.tenant_id,
            propertyId: data.property_id ?? undefined,
            referenceId: ra.id,
          },
        });
      } catch { /* best-effort */ }
    }

    return { role_assignment_id: ra.id, invitee_id: inviteeId };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string }) => d)
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

    // `profiles` RLS only lets a user read their own row (auth.uid() = id),
    // so the request-scoped client can never see other staff members' names —
    // every non-self row would silently come back null. This handler is
    // already admin-gated above, so the service-role lookup here is safe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null }));
  });

export const revokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string; role_assignment_id: string }) => d)
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

const updateStaffSchema = z.object({
  tenant_id: z.string().uuid(),
  role_assignment_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6),
});

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateStaffSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: ra, error: raErr } = await supabase
      .from("role_assignments")
      .select("user_id")
      .eq("id", data.role_assignment_id)
      .eq("tenant_id", data.tenant_id)
      .single();
    if (raErr || !ra) throw new Error("Staff member not found");

    // Editing another person's profile — same RLS blind spot as listStaff,
    // needs the service-role client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.full_name, phone: normalizeIndianPhone(data.phone) })
      .eq("id", ra.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string; role_assignment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);
    const { error } = await supabase
      .from("role_assignments")
      .delete()
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
  .validator((d) => propSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop } = await supabase
      .from("properties")
      .select("tenant_id,settings")
      .eq("id", data.property_id)
      .single();
    if (!prop) throw new Error("property not found");
    await assertAdmin(supabase, userId, prop.tenant_id);
    const existing = (typeof prop.settings === "object" && prop.settings !== null ? prop.settings : {}) as Record<string, any>;
    const merged = { ...existing, ...data.settings };
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
  .validator((d) => orgSchema.parse(d))
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
