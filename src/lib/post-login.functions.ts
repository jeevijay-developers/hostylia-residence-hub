import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone, phoneNumbersMatch } from "@/schemas/auth";

export type PostLoginDestination =
  | "/super-admin/dashboard"
  | "/admin/dashboard"
  | "/accountant/dashboard"
  | "/warden/daily-brief"
  | "/student/home"
  | "/parent/overview";

type ResolveResult =
  | { kind: "destination"; destination: PostLoginDestination }
  | { kind: "pending"; as?: "student" | "parent" }
  | { kind: "login" };

function destinationForRole(role: string | null | undefined): PostLoginDestination | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    case "HOSTEL_ADMIN":
      return "/admin/dashboard";
    case "ACCOUNTANT":
      return "/accountant/dashboard";
    case "WARDEN":
      return "/warden/daily-brief";
    case "STUDENT":
      return "/student/home";
    case "PARENT":
      return "/parent/overview";
    default:
      return null;
  }
}

async function activateInvitesForUser(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
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
}

async function linkGuardianProfiles(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  authPhone: string,
) {
  const { data: candidates, error: listErr } = await supabaseAdmin
    .from("guardians")
    .select("id, phone")
    .is("profile_id", null)
    .is("deleted_at", null);
  if (listErr) throw new Error(listErr.message);

  const matches = (candidates ?? []).filter((row) => phoneNumbersMatch(authPhone, row.phone ?? ""));
  for (const row of matches) {
    const { error } = await supabaseAdmin
      .from("guardians")
      .update({ profile_id: userId, portal_access_enabled: true })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  return matches.length;
}

async function linkStudentProfiles(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  authPhone: string,
) {
  const { data: candidates, error: listErr } = await supabaseAdmin
    .from("students")
    .select("id, tenant_id, property_id, phone, profile_id")
    .is("profile_id", null)
    .is("deleted_at", null);
  if (listErr) throw new Error(listErr.message);

  const matches = (candidates ?? []).filter((row) => phoneNumbersMatch(authPhone, row.phone ?? ""));
  let linked = 0;
  const nowIso = new Date().toISOString();

  for (const student of matches) {
    const { error: linkErr } = await supabaseAdmin
      .from("students")
      .update({ profile_id: userId, portal_access_enabled: true })
      .eq("id", student.id);
    if (linkErr) throw new Error(linkErr.message);

    const { error: mErr } = await supabaseAdmin.from("tenant_memberships").upsert(
      {
        tenant_id: student.tenant_id,
        user_id: userId,
        status: "ACTIVE",
        joined_at: nowIso,
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw new Error(mErr.message);

    const { data: existingRole } = await supabaseAdmin
      .from("role_assignments")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", student.tenant_id)
      .eq("role", "STUDENT")
      .is("revoked_at", null)
      .limit(1);
    if (!existingRole?.length) {
      const { error: rErr } = await supabaseAdmin.from("role_assignments").insert({
        tenant_id: student.tenant_id,
        user_id: userId,
        role: "STUDENT",
        property_id: student.property_id,
        is_active: true,
        granted_at: nowIso,
      });
      if (rErr) throw new Error(rErr.message);
    }
    linked += 1;
  }
  return linked;
}

/**
 * Idempotent post-login pipeline: link guardian/student rows by phone, activate
 * staff invites, then resolve the dashboard route. Uses service role for phone
 * matching because guardians are not readable by phone until profile_id is set.
 */
export const resolvePostLoginDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResolveResult> => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (uErr || !userRes.user) return { kind: "login" };
    const user = userRes.user;
    const authPhone = user.phone ? normalizeIndianPhone(user.phone) : null;

    if (authPhone) {
      await linkGuardianProfiles(supabaseAdmin, userId, authPhone);
      await linkStudentProfiles(supabaseAdmin, userId, authPhone);
    }

    await activateInvitesForUser(supabase, userId);

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (isSuperAdmin) return { kind: "destination", destination: "/super-admin/dashboard" };

    const { data: memberships } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, status")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .limit(1);

    if (memberships && memberships.length > 0) {
      const tenantId = memberships[0].tenant_id;
      const { data: role, error: roleErr } = await supabase.rpc("get_user_role", {
        p_user_id: userId,
        p_tenant_id: tenantId,
      });
      if (roleErr) throw new Error(roleErr.message);
      const dest = destinationForRole(role);
      if (dest) return { kind: "destination", destination: dest };
    }

    const hostelName =
      (user.user_metadata?.hostel_name as string | undefined) ??
      (user.user_metadata?.hostelName as string | undefined);
    if (hostelName?.trim()) {
      const { error: provisionErr } = await supabase
        .rpc("fn_provision_tenant", { p_hostel_name: hostelName })
        .single();
      if (!provisionErr) return { kind: "destination", destination: "/admin/dashboard" };
    }

    const { data: studentRows } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .limit(1);
    if (studentRows?.length) return { kind: "destination", destination: "/student/home" };

    const { data: guardianRows } = await supabase
      .from("guardians")
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .limit(1);
    if (guardianRows?.length) return { kind: "destination", destination: "/parent/overview" };

    const signupRole = user.user_metadata?.signup_role as string | undefined;
    return {
      kind: "pending",
      as: signupRole === "STUDENT" ? "student" : "parent",
    };
  });
