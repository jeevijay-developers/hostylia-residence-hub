import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  guardianPhoneUpdateSchema,
  guardianSelfEditSchema,
  guardianStaffEditSchema,
} from "@/schemas/guardian";
import { normalizeIndianPhone } from "@/schemas/auth";
import { assertAdmin } from "@/lib/admin-staff.functions";

/**
 * PRD 7 permission matrix: Guardian/Parent records — Hostel Admin VCED, Warden VE.
 * guardians/student_guardians RLS write policies grant any WARDEN in the tenant
 * (not scoped by property), so — per PRD 7.1 "server-side is the primary guard" —
 * this handler enforces the warden's assigned-property scope explicitly rather
 * than relying on RLS alone.
 */
export const updateGuardianPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => guardianPhoneUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: link, error: linkErr } = await supabase
      .from("student_guardians")
      .select("tenant_id, student:students(property_id), guardian:guardians(id, phone)")
      .eq("student_id", data.student_id)
      .eq("guardian_id", data.guardian_id)
      .is("unlinked_at", null)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) throw new Error("Guardian is not linked to this student");

    const tenantId = link.tenant_id as string;
    const propertyId =
      (link.student as unknown as { property_id: string } | null)?.property_id ?? null;
    const currentPhone = (link.guardian as unknown as { phone: string } | null)?.phone ?? null;
    if (!propertyId) throw new Error("Student property could not be resolved");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: tenantId,
      _role: "HOSTEL_ADMIN",
    });
    if (adminErr) throw adminErr;

    if (!isAdmin) {
      const { data: wardenOk, error: wardenErr } = await supabase.rpc("warden_can_write_scope", {
        _user_id: userId,
        _tenant_id: tenantId,
        _property_id: propertyId,
        _block_id: null,
      });
      if (wardenErr) throw wardenErr;
      if (!wardenOk)
        throw new Error("You don't have permission to edit this guardian's phone number");
    }

    const normalizedPhone = normalizeIndianPhone(data.phone);

    const { error: updErr } = await supabase
      .from("guardians")
      .update({ phone: normalizedPhone })
      .eq("id", data.guardian_id)
      .eq("tenant_id", tenantId);
    if (updErr) throw updErr;

    // audit_logs has no client-writable INSERT policy by design — only
    // service-role can write it (see super-admin.functions.ts for the same pattern).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      property_id: propertyId,
      actor_user_id: userId,
      action: "GUARDIAN_PHONE_UPDATED",
      entity_type: "guardians",
      entity_id: data.guardian_id,
      before_data: { phone: currentPhone },
      after_data: { phone: normalizedPhone },
    });

    return { ok: true, phone: normalizedPhone };
  });

/**
 * Staff-side full guardian edit (name, phone, email, occupation, address)
 * from a student's profile. Same authorization shape as updateGuardianPhone
 * (Hostel Admin tenant-wide, Warden scoped to their assigned property) —
 * see that function's comment for the RLS/PRD 7 rationale.
 */
export const updateGuardianDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => guardianStaffEditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: link, error: linkErr } = await supabase
      .from("student_guardians")
      .select(
        "tenant_id, student:students(property_id), guardian:guardians(id, full_name, phone, email, occupation, address)",
      )
      .eq("student_id", data.student_id)
      .eq("guardian_id", data.guardian_id)
      .is("unlinked_at", null)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) throw new Error("Guardian is not linked to this student");

    const tenantId = link.tenant_id as string;
    const propertyId =
      (link.student as unknown as { property_id: string } | null)?.property_id ?? null;
    const before = link.guardian as unknown as {
      full_name: string;
      phone: string;
      email: string | null;
      occupation: string | null;
      address: { line1?: string; city?: string; state?: string; pincode?: string } | null;
    } | null;
    if (!propertyId) throw new Error("Student property could not be resolved");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: tenantId,
      _role: "HOSTEL_ADMIN",
    });
    if (adminErr) throw adminErr;

    if (!isAdmin) {
      const { data: wardenOk, error: wardenErr } = await supabase.rpc("warden_can_write_scope", {
        _user_id: userId,
        _tenant_id: tenantId,
        _property_id: propertyId,
        _block_id: null,
      });
      if (wardenErr) throw wardenErr;
      if (!wardenOk)
        throw new Error("You don't have permission to edit this guardian's details");
    }

    const normalizedPhone = normalizeIndianPhone(data.phone);
    const after = {
      full_name: data.fullName,
      phone: normalizedPhone,
      email: data.email ? data.email : null,
      occupation: data.occupation ? data.occupation : null,
      address: data.address ?? null,
    };

    const { error: updErr } = await supabase
      .from("guardians")
      .update(after)
      .eq("id", data.guardian_id)
      .eq("tenant_id", tenantId);
    if (updErr) throw updErr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      property_id: propertyId,
      actor_user_id: userId,
      action: "GUARDIAN_DETAILS_UPDATED",
      entity_type: "guardians",
      entity_id: data.guardian_id,
      before_data: before,
      after_data: after,
    });

    return { ok: true };
  });

/**
 * Parent Portal self-edit — the guardian's own name/email only. Relies on
 * the `guardians_self_update` RLS policy (profile_id = auth.uid()) plus the
 * `trg_guardians_guard_self_update` trigger, which rejects any attempt to
 * touch phone/tenant_id/profile_id/portal_access_enabled/status/deleted_at
 * regardless of what a client sends — this handler only ever builds a
 * {full_name, email} payload, but the trigger is the real guarantee, not
 * this whitelist (see 20260821104351_parent_module_permissions.sql).
 */
export const updateMyGuardianProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => guardianSelfEditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: guardian, error: gErr } = await supabase
      .from("guardians")
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!guardian) throw new Error("No guardian profile linked to your account");

    const { error } = await supabase
      .from("guardians")
      .update({
        full_name: data.fullName,
        email: data.email ? data.email : null,
      })
      .eq("id", guardian.id);
    if (error) throw error;

    return { ok: true };
  });

// Parent Permission Matrix — the 12 boolean capability columns on
// student_guardians (6 pre-existing + 6 added by
// 20260821104351_parent_module_permissions.sql). One row per
// guardian-student relationship, matching that migration's per-relationship
// design (a guardian can have different access per child).
const guardianPermissionsSchema = z
  .object({
    can_view_child_profile: z.boolean(),
    can_view_attendance: z.boolean(),
    can_view_finance: z.boolean(),
    can_pay_fees: z.boolean(),
    can_view_complaints: z.boolean(),
    can_create_complaints: z.boolean(),
    can_edit_own_complaints: z.boolean(),
    can_view_notices: z.boolean(),
    can_view_gate_events: z.boolean(),
    can_approve_gate_pass: z.boolean(),
    can_view_room_allocation: z.boolean(),
    can_view_documents: z.boolean(),
  })
  .partial();

const getGuardianPermissionsSchema = z.object({
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
});

/**
 * Admin/Super-Admin-only read of one guardian-student relationship's
 * permission flags, for the Parent Permission Matrix on the student detail
 * page. Deliberately stricter than updateGuardianPhone/updateGuardianDetails
 * above (Warden-inclusive) — the user's spec requires this matrix be
 * Admin/Super-Admin-only, so this reuses assertAdmin() (the same
 * HOSTEL_ADMIN-only check already gating updateStudentPermissions on this
 * exact page) rather than the Warden-scoped helper.
 */
export const getGuardianPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => getGuardianPermissionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: link, error } = await supabase
      .from("student_guardians")
      .select(
        "can_view_child_profile, can_view_attendance, can_view_finance, can_pay_fees, can_view_complaints, can_create_complaints, can_edit_own_complaints, can_view_notices, can_view_gate_events, can_approve_gate_pass, can_view_room_allocation, can_view_documents",
      )
      .eq("tenant_id", data.tenant_id)
      .eq("student_id", data.student_id)
      .eq("guardian_id", data.guardian_id)
      .is("unlinked_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!link) throw new Error("Guardian is not linked to this student");
    return { permissions: link };
  });

const updateGuardianPermissionsSchema = z.object({
  tenant_id: z.string().uuid(),
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
  permissions: guardianPermissionsSchema,
});

export const updateGuardianPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateGuardianPermissionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.tenant_id);

    const { data: link, error: linkErr } = await supabase
      .from("student_guardians")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("student_id", data.student_id)
      .eq("guardian_id", data.guardian_id)
      .is("unlinked_at", null)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) throw new Error("Guardian is not linked to this student");

    const { error } = await supabase
      .from("student_guardians")
      .update(data.permissions)
      .eq("id", link.id);
    if (error) throw error;
    return { ok: true };
  });
