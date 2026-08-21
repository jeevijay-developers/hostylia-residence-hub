import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone } from "@/schemas/auth";

// The independently-RLS'd finance resources an Accountant has by default and
// a Warden can be individually granted (see can_manage_*() in
// 20260814070000_warden_granular_finance_permissions.sql) — widen this
// alongside that migration's CHECK constraint if more keys are added.
//
// The independently-RLS'd operational resources a Warden has by default and
// an Accountant can be individually granted (see can_manage_*() in
// 20260814090000_accountant_granular_operational_permissions.sql).
// `mess_menus` also covers mess menu items and headcount; `feedback` is the
// staff-authored survey tool (feedback_surveys/feedback_responses), not the
// per-meal mess rating (which staff can only read, nothing to "manage").
//
// Fully granular per-verb pilot (see can_view_invoices()/can_create_students()
// etc. in 20260814110000_granular_crud_pilot_students_invoices.sql):
// `invoices_view` also covers receipts and aging/DSO reports; `invoices_edit`
// also covers GST invoicing fields and discounts/waivers — neither is a
// separate RLS-gated resource. Students has no `students_view` key — every
// role already has View by default, so there's no gap to grant.
const staffPermissionsSchema = z
  .object({
    fee_plans_view: z.boolean(),
    fee_plans_create: z.boolean(),
    fee_plans_edit: z.boolean(),
    fee_plans_delete: z.boolean(),
    payments_view: z.boolean(),
    payments_create: z.boolean(),
    payments_edit: z.boolean(),
    payments_delete: z.boolean(),
    refunds: z.boolean(),
    invoices_view: z.boolean(),
    invoices_create: z.boolean(),
    invoices_edit: z.boolean(),
    invoices_delete: z.boolean(),
    complaints: z.boolean(),
    gate_events: z.boolean(),
    notices: z.boolean(),
    mess_menus: z.boolean(),
    feedback: z.boolean(),
    students_view: z.boolean(),
    students_create: z.boolean(),
    students_edit: z.boolean(),
    students_delete: z.boolean(),
    allocations_view: z.boolean(),
    allocations_create: z.boolean(),
    allocations_edit: z.boolean(),
    rooms_beds_view: z.boolean(),
    rooms_beds_edit: z.boolean(),
    rooms_beds_create: z.boolean(),
    rooms_beds_delete: z.boolean(),
    attendance_view: z.boolean(),
    attendance_create: z.boolean(),
    attendance_edit: z.boolean(),
    attendance_delete: z.boolean(),
    gate_passes_view: z.boolean(),
    gate_passes_create: z.boolean(),
    gate_passes_edit: z.boolean(),
    gate_passes_delete: z.boolean(),
    visitors_view: z.boolean(),
    visitors_create: z.boolean(),
    visitors_edit: z.boolean(),
    visitors_delete: z.boolean(),
    reports_view: z.boolean(),
  })
  .partial();

const inviteSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid().nullable().optional(),
  block_id: z.string().uuid().nullable().optional(),
  full_name: z.string().trim().min(2).max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().min(6).nullable().optional(),
  role: z.enum(["WARDEN", "ACCOUNTANT"]),
  // Omitted/empty = use the role's default access, unchanged.
  permissions: staffPermissionsSchema.optional(),
});

export async function assertAdmin(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase.rpc("has_tenant_role", {
    _user_id: userId,
    _tenant_id: tenantId,
    _role: "HOSTEL_ADMIN",
  });
  if (error) throw error;
  if (!data) throw new Error("Only HOSTEL_ADMIN can manage staff");
}

/**
 * Best-effort invite/resend notification (IN_APP + email/SMS depending on
 * which contact channel the person was invited through). Shared by
 * `inviteStaff` and `resendStaffInvite` so there's one notification path,
 * not two.
 *
 * Enriches the notification with: invitee display name, hostel/org name,
 * invitation date, and a password-setup link generated via the admin API.
 */
async function sendStaffInviteNotification(
  supabase: any,
  args: {
    inviteeId: string;
    email: string | null;
    phone: string | null;
    role: string;
    tenantId: string;
    propertyId?: string | null;
    referenceId: string;
  },
) {
  try {
    await sendStaffInviteNotificationInner(supabase, args);
  } catch (e) {
    // Fire-and-forget from the caller's side (see inviteStaff/resendStaffInvite)
    // — staff creation must never fail because the invite email was slow or
    // the provider errored, so nothing here is allowed to throw or reject.
    console.warn("sendStaffInviteNotification failed (staff record was still created)", e);
  }
}

async function sendStaffInviteNotificationInner(
  supabase: any,
  args: {
    inviteeId: string;
    email: string | null;
    phone: string | null;
    role: string;
    tenantId: string;
    propertyId?: string | null;
    referenceId: string;
  },
) {
  // Service-role client for cross-user lookups and admin auth API
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Resolve invitee display name from profiles
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", args.inviteeId)
    .maybeSingle();
  const inviteeName =
    profileRow?.full_name?.trim() || (args.email ? args.email.split("@")[0] : null) || "there";

  // 2. Resolve hostel/property name for the email body
  let hostelName = "Hostylia";
  if (args.propertyId) {
    const { data: propRow } = await supabaseAdmin
      .from("properties")
      .select("name")
      .eq("id", args.propertyId)
      .maybeSingle();
    if (propRow?.name) hostelName = propRow.name;
  } else {
    // Fall back to the tenant's organization legal name
    const { data: orgRows } = await supabaseAdmin
      .from("organizations")
      .select("legal_name")
      .eq("tenant_id", args.tenantId)
      .limit(1);
    const orgName = orgRows?.[0]?.legal_name;
    if (orgName) hostelName = orgName;
  }

  // 3. Generate a password-setup link (email invites only).
  //    We use type:"recovery" so the user lands on /reset-password and can
  //    set their first password. APP_URL must be set to the production URL
  //    in the server environment — falls back to localhost for local dev.
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let setupUrl = `${appUrl}/reset-password`;
  if (args.email) {
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: args.email,
        options: { redirectTo: `${appUrl}/reset-password` },
      });
      // Supabase returns the action_link under properties
      const actionLink = (linkData as Record<string, unknown> | null)?.properties as
        Record<string, unknown> | undefined;
      if (actionLink?.action_link) setupUrl = String(actionLink.action_link);
    } catch {
      // best-effort — plain /reset-password link is still usable
    }
  }

  // Human-readable role label
  const roleDisplay =
    args.role === "WARDEN"
      ? "Warden"
      : args.role === "ACCOUNTANT"
        ? "Accountant"
        : args.role === "HOSTEL_ADMIN"
          ? "Hostel Admin"
          : args.role;

  const inviteDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const variables: Record<string, string> = {
    role: roleDisplay,
    invitee_name: inviteeName,
    hostel_name: hostelName,
    invite_date: inviteDate,
    setup_url: setupUrl,
    expiry_days: "7",
    year: new Date().getFullYear().toString(),
  };

  const channels: Array<"IN_APP" | "EMAIL" | "SMS"> = ["IN_APP", args.email ? "EMAIL" : "SMS"];
  let emailFailure: string | null = null;
  for (const ch of channels) {
    const recipient: Record<string, string | undefined> = {};
    if (ch === "IN_APP") recipient.userId = args.inviteeId;
    if (ch === "EMAIL") recipient.email = args.email ?? undefined;
    if (ch === "SMS") recipient.phone = args.phone ?? undefined;
    if (!recipient.userId && !recipient.email && !recipient.phone) continue;
    try {
      // supabase.functions.invoke only rejects/sets `error` on a non-2xx HTTP
      // response — send-notification always answers 200 and reports real
      // provider failures (e.g. Resend rejecting the API key) in the JSON
      // body instead. Reading `data.ok` here is required, not optional —
      // without it a failed send looks identical to a successful one.
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          channel: ch,
          templateKey: "staff_invite",
          recipient,
          variables,
          eventType: "STAFF_INVITE",
          tenantId: args.tenantId,
          propertyId: args.propertyId ?? undefined,
          referenceId: args.referenceId,
        },
      });
      const body = data as { ok?: boolean; message?: string; error_code?: string } | null;
      if (ch === "EMAIL" && (error || body?.ok === false)) {
        emailFailure = body?.message || error?.message || "Email provider rejected the request";
      }
    } catch (e) {
      // IN_APP/SMS stay best-effort (unchanged); EMAIL failures are surfaced
      // so callers can decide whether to report or swallow them.
      if (ch === "EMAIL") emailFailure = e instanceof Error ? e.message : "Email send failed";
    }
  }
  if (emailFailure) throw new Error(emailFailure);
}

/**
 * Invite Warden/Accountant. Creates the tenant_membership as INVITED and
 * the role_assignment as `is_active: false` — a PENDING invitation, not
 * live access. `role_assignments.is_active` is exactly what every RLS
 * helper (`is_finance_staff`, `has_tenant_role`, `get_user_role`, etc.)
 * gates on, so a pending invite genuinely cannot reach any staff route or
 * RLS-protected data — no separate "pending block" needed anywhere else.
 * Activation happens the moment the invitee actually signs in for the
 * first time and proves ownership of the contact info (password sign-in
 * or OTP verification), via the pre-existing `activateMyInvites()` —
 * already wired into both `LoginForm.tsx` and `verify-otp.tsx`. This
 * restores that intended flow; a later change had short-circuited it by
 * marking new assignments active immediately, which is the bug this
 * fixes (an invite to a bounced/non-existent email looked identical to a
 * real active staff member).
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
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }
    if (!inviteeId && phone) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .limit(1);
      if (p && p.length) inviteeId = p[0].id;
    }

    // Reusing an existing (e.g. orphaned/partial-invite/test) profile skips
    // the createUser call below, which is the only place full_name otherwise
    // gets set — so the name the admin just typed here would silently be
    // dropped in favor of whatever (often garbage, from earlier testing)
    // name the shell profile already had. The admin typing a name in this
    // form is a deliberate act — it should always win.
    if (inviteeId && data.full_name) {
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.full_name })
        .eq("id", inviteeId);
    }

    // Duplicate handling: an already-ACTIVE assignment for this exact
    // person+role+tenant is a real conflict; an already-PENDING one just
    // means "resend", not "create a second invite".
    if (inviteeId) {
      const { data: existingRa } = await supabase
        .from("role_assignments")
        .select("id,is_active,revoked_at")
        .eq("tenant_id", data.tenant_id)
        .eq("user_id", inviteeId)
        .eq("role", data.role)
        .is("revoked_at", null)
        .order("granted_at", { ascending: false })
        .limit(1);
      const existing = existingRa?.[0];
      if (existing?.is_active) {
        throw new Error("This person already has active access for this role.");
      }
      if (existing && !existing.is_active) {
        // Not awaited — the invite/resend response must not wait on email
        // delivery; sendStaffInviteNotification never throws (see above).
        void sendStaffInviteNotification(supabase, {
          inviteeId,
          email: data.email ?? null,
          phone,
          role: data.role,
          tenantId: data.tenant_id,
          propertyId: data.property_id,
          referenceId: existing.id,
        });
        return { role_assignment_id: existing.id, invitee_id: inviteeId, resent: true as const };
      }
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

    // tenant_memberships — INVITED, not ACTIVE. `activateMyInvites` flips
    // this (and joined_at) to ACTIVE on the invitee's first real sign-in.
    const nowIso = new Date().toISOString();
    const { error: mErr } = await supabase.from("tenant_memberships").upsert(
      {
        tenant_id: data.tenant_id,
        user_id: inviteeId,
        status: "INVITED",
        invited_by: userId,
        invited_at: nowIso,
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw mErr;

    // role_assignments — PENDING (is_active: false) until accepted.
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
        granted_at: nowIso,
        permissions: data.permissions ?? {},
      })
      .select()
      .single();
    if (rErr) throw rErr;

    // Not awaited — staff is already saved (tenant_membership + role_assignment
    // above are committed); the invite email sends in the background and can
    // never fail or slow down this response.
    void sendStaffInviteNotification(supabase, {
      inviteeId,
      email: data.email ?? null,
      phone,
      role: data.role,
      tenantId: data.tenant_id,
      propertyId: data.property_id,
      referenceId: ra.id,
    });

    return { role_assignment_id: ra.id, invitee_id: inviteeId, resent: false as const };
  });

/**
 * Resend the invite notification for a still-pending (not yet accepted,
 * not revoked) role_assignment. Does not touch is_active/status — the
 * invitation stays PENDING until the invitee actually signs in.
 */
export const resendStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string; role_assignment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: ra, error: raErr } = await supabase
      .from("role_assignments")
      .select("id,user_id,role,property_id,is_active,revoked_at")
      .eq("id", data.role_assignment_id)
      .eq("tenant_id", data.tenant_id)
      .single();
    if (raErr || !ra) throw new Error("Invitation not found");
    if (ra.revoked_at) throw new Error("This invitation was cancelled");
    if (ra.is_active) throw new Error("This person already has active access");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email,phone")
      .eq("id", ra.user_id)
      .single();

    // Unlike inviteStaff's fire-and-forget (staff creation must never fail on
    // a slow/broken email provider), "resend" IS the email — the admin needs
    // to know if it actually went out. Call the inner sender directly (not
    // the always-succeeds wrapper) and report its real outcome instead of
    // silently claiming success when the provider rejected it.
    try {
      await sendStaffInviteNotificationInner(supabase, {
        inviteeId: ra.user_id,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        role: ra.role,
        tenantId: data.tenant_id,
        propertyId: ra.property_id,
        referenceId: ra.id,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not send the invitation email";
      console.error("resendStaffInvite: notification failed", e);
      return { ok: false as const, message };
    }

    return { ok: true as const, message: null };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);
    // Delegated staff only — HOSTEL_ADMIN is the account-owner/superset role,
    // not a "staff" member managed from this page (that assignment happens
    // via Super Admin → Tenants, a separate flow this list must not affect).
    const { data: rows, error } = await supabase
      .from("role_assignments")
      .select("id,user_id,role,property_id,block_id,is_active,granted_at,revoked_at,permissions")
      .eq("tenant_id", data.tenant_id)
      .in("role", ["WARDEN", "ACCOUNTANT"])
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
  // Omitted = leave block scope untouched; null = "all blocks" (property-wide).
  block_id: z.string().uuid().nullable().optional(),
  // Omitted = leave permissions untouched. An explicit {} clears any
  // existing override, reverting the staff member to their role default.
  permissions: staffPermissionsSchema.optional(),
});

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateStaffSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: ra, error: raErr } = await supabase
      .from("role_assignments")
      .select("user_id, role")
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

    if (data.block_id !== undefined) {
      const { error: blockErr } = await supabase
        .from("role_assignments")
        .update({ block_id: data.block_id })
        .eq("id", data.role_assignment_id)
        .eq("tenant_id", data.tenant_id);
      if (blockErr) throw blockErr;
    }

    if (data.permissions !== undefined) {
      // Hostel Admin already has unconditional access to every feature —
      // customizing wouldn't mean anything, and a stray `finance: false`
      // could get read as revoking their own access.
      if (ra.role === "HOSTEL_ADMIN") {
        throw new Error("Permissions cannot be customized for a Hostel Admin");
      }
      const { error: permErr } = await supabase
        .from("role_assignments")
        .update({ permissions: data.permissions })
        .eq("id", data.role_assignment_id)
        .eq("tenant_id", data.tenant_id);
      if (permErr) throw permErr;
    }

    return { ok: true };
  });

// The 7 real student-facing modules (see 20260821060645_student_module_permissions.sql)
// — Attendance/Notices are read-only for students, so they have no `_edit`
// key at all; sending one is simply ignored by the CHECK constraint's
// allow-list (it isn't in it), so keep them out of this schema too.
const studentPermissionsSchema = z
  .object({
    student_profile_view: z.boolean(),
    student_profile_edit: z.boolean(),
    student_attendance_view: z.boolean(),
    student_complaints_view: z.boolean(),
    student_complaints_edit: z.boolean(),
    student_notices_view: z.boolean(),
    student_finance_view: z.boolean(),
    student_finance_edit: z.boolean(),
    student_gate_passes_view: z.boolean(),
    student_gate_passes_edit: z.boolean(),
    student_mess_view: z.boolean(),
    student_mess_edit: z.boolean(),
  })
  .partial();

const getStudentPermissionsSchema = z.object({
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
});

export const getStudentPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => getStudentPermissionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("profile_id")
      .eq("id", data.student_id)
      .eq("tenant_id", data.tenant_id)
      .single();
    if (sErr || !student) throw new Error("Student not found");
    if (!student.profile_id) return { permissions: {}, linked: false as const };

    const { data: ra } = await supabase
      .from("role_assignments")
      .select("permissions")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", student.profile_id)
      .eq("role", "STUDENT")
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { permissions: ra?.permissions ?? {}, linked: true as const };
  });

const updateStudentPermissionsSchema = z.object({
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  // An explicit {} clears any existing override, reverting every module to
  // its default (Edit — see the migration's column comment).
  permissions: studentPermissionsSchema,
});

/**
 * Admin-only write path for a student's module permissions — same shape as
 * updateStaff's permissions PATCH (client → server fn → RLS-protected
 * update of role_assignments.permissions), not a new privileged flow. A
 * student's STUDENT role_assignments row already exists for every admitted
 * student (created for tenant/property scoping); this only ever updates
 * it, never inserts one, since an unlinked student (no portal account yet)
 * has nothing to gate.
 */
export const updateStudentPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateStudentPermissionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("profile_id")
      .eq("id", data.student_id)
      .eq("tenant_id", data.tenant_id)
      .single();
    if (sErr || !student) throw new Error("Student not found");
    if (!student.profile_id) {
      throw new Error("Student has no linked portal account yet — nothing to configure");
    }

    const { data: ra, error: raErr } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", student.profile_id)
      .eq("role", "STUDENT")
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (raErr) throw raErr;
    if (!ra) throw new Error("Student has no role assignment on record");

    const { error } = await supabase
      .from("role_assignments")
      .update({ permissions: data.permissions })
      .eq("id", ra.id);
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
    const existing = (
      typeof prop.settings === "object" && prop.settings !== null ? prop.settings : {}
    ) as Record<string, any>;
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
