import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guardianPhoneUpdateSchema, guardianStaffEditSchema } from "@/schemas/guardian";
import { normalizeIndianPhone } from "@/schemas/auth";

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
