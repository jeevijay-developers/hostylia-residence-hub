import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone } from "@/schemas/auth";
import {
  publicAdmissionSchema,
  studentBulkRowSchema,
  manualStudentRowSchema,
  allocationCreateSchema,
  clickConsentSchema,
  studentSelfProfileSchema,
  studentStaffProfileEditSchema,
} from "@/schemas/student";

// Matches uidx_allocations_active_student — the statuses that count as a
// student's current (not yet closed/cancelled) stay.
const OPEN_ALLOCATION_STATUSES = [
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
];

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(): string {
  try {
    const req = getRequest();
    const xff = getRequestHeader("x-forwarded-for") || req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = getRequestHeader("x-real-ip") || req.headers.get("x-real-ip");
    return real || "unknown";
  } catch {
    return "unknown";
  }
}

function nextAdmissionNumber(): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `A${y}-${rand}`;
}

/**
 * PUBLIC UNAUTHENTICATED admission submission. Only entry point where
 * anonymous callers can write to public.students. Uses service role after
 * validating the property slug + IP rate limit.
 */
export const submitPublicAdmission = createServerFn({ method: "POST" })
  .validator((data) => publicAdmissionSchema.parse(data))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const admin = adminClient();

    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_bucket_key: `admission:${ip}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (rlErr) throw new Error("Rate limiter unavailable");
    if (!allowed)
      throw new Error("Too many applications from this network. Please try again later.");

    const { data: props, error: pErr } = await admin
      .from("properties")
      .select("id, tenant_id, status")
      .eq("slug", data.property_slug)
      .is("deleted_at", null)
      .limit(2);
    if (pErr) throw new Error(pErr.message);
    if (!props?.length) throw new Error("Property not found");
    if (props.length > 1) throw new Error("Property slug is ambiguous — contact the hostel");
    const property = props[0];
    if (property.status !== "ACTIVE") throw new Error("Property is not accepting applications");

    const dob = data.date_of_birth || null;
    const isMinor = dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : false;

    const { data: student, error: sErr } = await admin
      .from("students")
      .insert({
        tenant_id: property.tenant_id,
        property_id: property.id,
        admission_number: nextAdmissionNumber(),
        full_name: data.full_name,
        phone: data.phone,
        email: data.email || null,
        date_of_birth: dob,
        gender: data.gender ?? null,
        academic_institute: data.academic_institute || null,
        course_name: data.course_name || null,
        academic_year: data.academic_year || null,
        is_minor: isMinor,
        status: "APPLICANT",
        metadata: { source: "public_admission", ip },
      })
      .select("id, admission_number")
      .single();
    if (sErr) throw new Error(sErr.message);

    // Upsert guardian by (tenant, phone), then link.
    const normalizedPhone = normalizeIndianPhone(data.guardian_phone);

    const { data: existingG } = await admin
      .from("guardians")
      .select("id")
      .eq("tenant_id", property.tenant_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    let guardianId = existingG?.id;
    if (!guardianId) {
      const { data: gIns, error: gErr } = await admin
        .from("guardians")
        .insert({
          tenant_id: property.tenant_id,
          full_name: data.guardian_name,
          phone: normalizedPhone,
        })
        .select("id")
        .single();
      if (gErr) throw new Error(gErr.message);
      guardianId = gIns.id;
    }

    await admin.from("student_guardians").insert({
      tenant_id: property.tenant_id,
      student_id: student.id,
      guardian_id: guardianId!,
      relationship: data.guardian_relationship,
      is_primary: true,
      is_emergency_contact: true,
    });

    return { ok: true as const, admission_number: student.admission_number };
  });

const bulkImportSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  // Each row is validated individually in the handler so one bad row
  // doesn't reject the whole batch — this must stay loose here.
  rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
});

async function insertStudentRow(
  supabase: ReturnType<typeof adminClient>,
  tenantId: string,
  propertyId: string,
  r: z.infer<typeof studentBulkRowSchema>,
) {
  const dob =
    r.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth) ? r.date_of_birth : null;
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      tenant_id: tenantId,
      property_id: propertyId,
      admission_number: nextAdmissionNumber(),
      full_name: r.full_name,
      phone: r.phone || null,
      email: r.email || null,
      date_of_birth: dob,
      gender: r.gender || null,
      academic_institute: r.academic_institute || null,
      course_name: r.course_name || null,
      is_minor: dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : false,
      status: "APPLICANT",
    })
    .select("id, admission_number")
    .single();
  if (error) throw error;

  if (r.guardian_phone && r.guardian_name) {
    const phone = normalizeIndianPhone(r.guardian_phone);
    const { data: eg } = await supabase
      .from("guardians")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();
    let gid = eg?.id;
    if (!gid) {
      const { data: gi, error: gErr } = await supabase
        .from("guardians")
        .insert({ tenant_id: tenantId, full_name: r.guardian_name, phone })
        .select("id")
        .single();
      if (gErr) throw gErr;
      gid = gi?.id;
    }
    if (gid) {
      await supabase.from("student_guardians").insert({
        tenant_id: tenantId,
        student_id: student.id,
        guardian_id: gid,
        relationship: "GUARDIAN",
        is_primary: true,
      });
    }
  }
  return student;
}

export const bulkImportStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => bulkImportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const errors: { row: number; error: string }[] = [];
    let inserted = 0;
    for (let i = 0; i < data.rows.length; i++) {
      const parsed = studentBulkRowSchema.safeParse(data.rows[i]);
      if (!parsed.success) {
        errors.push({ row: i + 1, error: parsed.error.issues.map((x) => x.message).join("; ") });
        continue;
      }
      try {
        await insertStudentRow(supabase, data.tenant_id, data.property_id, parsed.data);
        inserted += 1;
      } catch (e) {
        errors.push({ row: i + 1, error: e instanceof Error ? e.message : "unknown" });
      }
    }
    return { inserted, failed: errors.length, errors };
  });

const manualCreateSchema = manualStudentRowSchema.extend({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
});

/** Single-student manual add for Admin/Warden — same insert path as bulk import, one row at a time. */
export const createStudentManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => manualCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const student = await insertStudentRow(supabase, data.tenant_id, data.property_id, data);
    return { id: student.id, admission_number: student.admission_number };
  });

const confirmAdmissionSchema = z.object({
  student_id: z.string().uuid(),
});

/** Digits only, so "+91 98765-43210", "919876543210" and "9876543210" all
 * reduce to a comparable form regardless of who typed which format. */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Links an APPLICANT's admission record to the account they signed up with
 * (matched by the phone/email already on file), and grants them the STUDENT
 * role for this tenant. Until this runs, the student is stuck on
 * /access-pending no matter what "approving" they see on the admin side —
 * profile_id/tenant_membership/role_assignment are what RoleRedirect and the
 * self-access RLS policies actually key off of.
 */
export const confirmStudentAdmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => confirmAdmissionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, property_id, phone, email, profile_id")
      .eq("id", data.student_id)
      .single();
    if (sErr || !student) throw new Error("Student not found");
    if (student.profile_id) throw new Error("This student is already linked to an account");

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: student.tenant_id,
      _role: "HOSTEL_ADMIN",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Only a Hostel Admin can confirm admissions");

    // Match the account they already signed up with — same lookup pattern as
    // staff invites: email first, then phone. `profiles` RLS only allows
    // reading your own row, so looking up someone else's by contact info
    // needs the service-role client, not the request-scoped `supabase`.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let matchedId: string | null = null;
    if (student.email) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", student.email)
        .limit(1);
      if (p && p.length) matchedId = p[0].id;
    }
    if (!matchedId && student.phone) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", student.phone)
        .limit(1);
      if (p && p.length) matchedId = p[0].id;
    }
    // Fall back to a country-code-agnostic match: the admission phone may
    // have been entered without "+91" while the signed-up account's phone
    // (captured verbatim from the OTP flow) has it, or vice versa.
    if (!matchedId && student.phone) {
      const suffix = phoneDigits(student.phone).slice(-10);
      if (suffix.length === 10) {
        const { data: candidates } = await supabaseAdmin
          .from("profiles")
          .select("id, phone")
          .like("phone", `%${suffix}`)
          .limit(5);
        const match = candidates?.find((c) => phoneDigits(c.phone ?? "").endsWith(suffix));
        if (match) matchedId = match.id;
      }
    }
    if (!matchedId) {
      throw new Error(
        "No account found with this student's phone/email yet — ask them to sign up first, then confirm again.",
      );
    }

    const { data: already } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", matchedId)
      .is("deleted_at", null)
      .limit(1);
    if (already && already.length) {
      throw new Error("That account is already linked to another student record");
    }

    const { error: linkErr } = await supabase
      .from("students")
      .update({ profile_id: matchedId, portal_access_enabled: true })
      .eq("id", student.id);
    if (linkErr) throw new Error(linkErr.message);

    const { error: mErr } = await supabase.from("tenant_memberships").upsert(
      {
        tenant_id: student.tenant_id,
        user_id: matchedId,
        status: "ACTIVE",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw new Error(mErr.message);

    const { error: rErr } = await supabase.from("role_assignments").insert({
      tenant_id: student.tenant_id,
      user_id: matchedId,
      role: "STUDENT",
      property_id: student.property_id,
      is_active: true,
      granted_by: userId,
      granted_at: new Date().toISOString(),
    });
    if (rErr) throw new Error(rErr.message);

    // A self-signed-up student captures their guardian's name/phone as auth
    // metadata (SignupForm). If nobody entered a guardian for this student
    // yet (admin add / bulk import / public admission all do it up front),
    // create one from that metadata now that we know which auth user this is.
    const { data: existingLink } = await supabase
      .from("student_guardians")
      .select("id")
      .eq("student_id", student.id)
      .is("unlinked_at", null)
      .limit(1);
    if (!existingLink?.length) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(matchedId);
      const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
      const guardianName = typeof meta?.guardian_name === "string" ? meta.guardian_name : "";
      const guardianPhoneRaw = typeof meta?.guardian_phone === "string" ? meta.guardian_phone : "";
      if (guardianName.trim() && guardianPhoneRaw.trim()) {
        const guardianPhone = normalizeIndianPhone(guardianPhoneRaw);
        const { data: existingG } = await supabase
          .from("guardians")
          .select("id")
          .eq("tenant_id", student.tenant_id)
          .eq("phone", guardianPhone)
          .maybeSingle();
        let guardianId = existingG?.id;
        if (!guardianId) {
          const { data: gIns, error: gErr } = await supabase
            .from("guardians")
            .insert({ tenant_id: student.tenant_id, full_name: guardianName, phone: guardianPhone })
            .select("id")
            .single();
          if (gErr) throw new Error(gErr.message);
          guardianId = gIns.id;
        }
        await supabase.from("student_guardians").insert({
          tenant_id: student.tenant_id,
          student_id: student.id,
          guardian_id: guardianId,
          relationship: "GUARDIAN",
          is_primary: true,
          is_emergency_contact: true,
        });
      }
    }

    return { ok: true as const, linked_profile_id: matchedId };
  });

export const createAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => allocationCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: bed, error: bErr } = await supabase
      .from("beds")
      .select("id, tenant_id, property_id, room_id, floor_id, block_id, status")
      .eq("id", data.bed_id)
      .single();
    if (bErr || !bed) throw new Error("Bed not found");
    if (bed.status !== "VACANT") throw new Error("Bed is not vacant");

    const { data: alloc, error: aErr } = await supabase
      .from("allocations")
      .insert({
        tenant_id: bed.tenant_id,
        property_id: bed.property_id,
        student_id: data.student_id,
        bed_id: bed.id,
        room_id: bed.room_id,
        floor_id: bed.floor_id,
        block_id: bed.block_id,
        fee_plan_id: data.fee_plan_id,
        status: "PENDING_AGREEMENT",
        start_date: data.start_date,
        expected_end_date: data.expected_end_date || null,
        rent_snapshot_paise: data.rent_snapshot_paise,
        deposit_snapshot_paise: data.deposit_snapshot_paise,
        billing_cycle_day: data.billing_cycle_day,
        lock_in_until: data.lock_in_until || null,
        notice_period_days: data.notice_period_days,
      })
      .select("id, tenant_id, property_id, student_id")
      .single();
    if (aErr) throw new Error(aErr.message);

    // Draft agreement
    const { data: agree, error: agErr } = await supabase
      .from("agreements")
      .insert({
        tenant_id: alloc.tenant_id,
        property_id: alloc.property_id,
        student_id: alloc.student_id,
        allocation_id: alloc.id,
        template_version: "v1",
        status: "SENT",
        sent_at: new Date().toISOString(),
        signature_method: "CLICK_CONSENT",
      })
      .select("id")
      .single();
    if (agErr) throw new Error(agErr.message);

    await supabase.from("allocations").update({ agreement_id: agree.id }).eq("id", alloc.id);
    return { allocation_id: alloc.id, agreement_id: agree.id };
  });

export const acceptAgreementClickwrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => clickConsentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ip = getClientIp();
    const ua = (() => {
      try {
        return (
          getRequestHeader("user-agent") || getRequest().headers.get("user-agent") || "unknown"
        );
      } catch {
        return "unknown";
      }
    })();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("agreements")
      .update({
        status: "SIGNED",
        signed_at: now,
        signed_by_user_id: userId,
        signature_method: "CLICK_CONSENT",
        signature_evidence: {
          accepted_at: now,
          ip_address: ip,
          user_agent: ua,
          document_hash: data.document_hash,
        },
      })
      .eq("id", data.agreement_id);
    if (error) throw new Error(error.message);

    // Advance allocation to PENDING_PAYMENT once signed
    const { data: agr } = await supabase
      .from("agreements")
      .select("allocation_id")
      .eq("id", data.agreement_id)
      .single();
    if (agr?.allocation_id) {
      // Students have no direct RLS write policy on `allocations` — this
      // transition has to go through a SECURITY DEFINER function (RULES.md
      // 19.3), not a raw client .update() (which would silently no-op here).
      const { error: advErr } = await supabase.rpc("advance_allocation_after_signing", {
        p_agreement_id: data.agreement_id,
      });
      if (advErr) throw new Error(advErr.message);

      // PRD 8.2.4: signing → "deposit + first-month invoice generated" —
      // this is a one-time move-in invoice, distinct from fn_generate_invoices'
      // recurring monthly cron (which deliberately excludes DEPOSIT and only
      // fires on an allocation's billing_cycle_day). Best-effort: a student
      // shouldn't be blocked from signing because invoicing hiccuped.
      try {
        await generateFirstInvoiceForAllocation(supabase, agr.allocation_id);
      } catch (e) {
        console.error("[acceptAgreementClickwrap] first invoice generation failed", e);
      }
    }
    return { ok: true as const };
  });

/**
 * Deposit + first billing period invoice, issued once at agreement
 * acceptance (PRD 8.2.4). Mirrors fn_generate_invoices' component rollup for
 * RENT/MESS/MAINTENANCE/OTHER, plus the allocation's own negotiated deposit
 * (allocations.deposit_snapshot_paise — not the fee plan's DEPOSIT
 * component, since the actual deposit can be customized per allocation).
 * Idempotent via the same (allocation_id, billing_period, fee_plan_id)
 * unique index the recurring generator relies on, so a double-submit of the
 * click-consent flow can't double-bill.
 */
async function generateFirstInvoiceForAllocation(
  supabase: SupabaseClient<Database>,
  allocationId: string,
) {
  const { data: alloc, error: aErr } = await supabase
    .from("allocations")
    .select("tenant_id, property_id, student_id, fee_plan_id, deposit_snapshot_paise")
    .eq("id", allocationId)
    .single();
  if (aErr || !alloc || !alloc.fee_plan_id) return;

  const { data: plan } = await supabase
    .from("fee_plans")
    .select("grace_period_days")
    .eq("id", alloc.fee_plan_id)
    .single();

  const { data: comps, error: cErr } = await supabase
    .from("fee_plan_components")
    .select("amount_paise, is_taxable, tax_rate_basis_points")
    .eq("fee_plan_id", alloc.fee_plan_id)
    .eq("is_active", true)
    .in("component_type", ["RENT", "MESS", "MAINTENANCE", "OTHER"]);
  if (cErr) throw new Error(cErr.message);

  let subtotal = alloc.deposit_snapshot_paise ?? 0;
  let tax = 0;
  for (const c of comps ?? []) {
    subtotal += c.amount_paise;
    if (c.is_taxable) tax += Math.floor((c.amount_paise * c.tax_rate_basis_points) / 10000);
  }
  if (subtotal <= 0) return;

  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const graceDays = plan?.grace_period_days ?? 0;
  const due = new Date(today);
  due.setDate(due.getDate() + graceDays);

  const { error } = await supabase.from("invoices").insert({
    tenant_id: alloc.tenant_id,
    property_id: alloc.property_id,
    student_id: alloc.student_id,
    allocation_id: allocationId,
    fee_plan_id: alloc.fee_plan_id,
    billing_period_start: periodStart,
    billing_period_end: periodEnd,
    issue_date: today.toISOString().slice(0, 10),
    due_date: due.toISOString().slice(0, 10),
    status: "ISSUED",
    subtotal_paise: subtotal,
    discount_paise: 0,
    tax_paise: tax,
    late_fee_paise: 0,
    total_paise: subtotal + tax,
    paid_paise: 0,
    refunded_paise: 0,
    balance_paise: subtotal + tax,
    issued_at: new Date().toISOString(),
    notes: "Security deposit + first month, generated on agreement acceptance.",
  });
  // 23505 = unique_violation on (allocation_id, billing_period, fee_plan_id) —
  // already generated (e.g. a retried click-consent submit); not an error.
  if (error && (error as { code?: string }).code !== "23505") throw new Error(error.message);
}

const moveOutSchema = z.object({
  allocation_id: z.string().uuid(),
  actual_end_date: z.string().date(),
});

export const moveOutAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => moveOutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Closes the allocation, moves the student out, frees the bed, and
    // deducts any outstanding dues from the deposit — all atomically in one
    // DB function per RULES.md 19.3/19.5 (no independent bed.status writes).
    const { error } = await supabase.rpc("complete_move_out", {
      p_allocation_id: data.allocation_id,
      p_actual_end_date: data.actual_end_date,
    });
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

const deleteStudentSchema = z.object({
  student_id: z.string().uuid(),
});

/**
 * Soft-deletes a student record (sets deleted_at, matching the
 * `.is("deleted_at", null)` convention every student query filters on).
 * Only a Hostel Admin may delete, and it's blocked while the student is
 * ACTIVE/NOTICE_GIVEN — move them out first so their bed doesn't end up
 * occupied by a record nobody can see anymore.
 */
export const deleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => deleteStudentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, status")
      .eq("id", data.student_id)
      .is("deleted_at", null)
      .single();
    if (sErr || !student) throw new Error("Student not found");
    if (student.status === "ACTIVE" || student.status === "NOTICE_GIVEN") {
      throw new Error("Move this student out before deleting their record");
    }

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: student.tenant_id,
      _role: "HOSTEL_ADMIN",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Only a Hostel Admin can delete a student record");

    const { error } = await supabase
      .from("students")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", student.id)
      .eq("tenant_id", student.tenant_id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

export const previewMoveOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ allocation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: eDate }, { data: refund }] = await Promise.all([
      supabase.rpc("earliest_move_out_date", { p_allocation_id: data.allocation_id }),
      supabase.rpc("provisional_refund_paise", { p_allocation_id: data.allocation_id }),
    ]);
    return {
      earliest_move_out_date: eDate as string | null,
      provisional_refund_paise: (refund as number | null) ?? 0,
    };
  });

/**
 * Register a document row after a client-side signed upload has completed.
 * Client uploads to storage via signed URL, then calls this to record metadata.
 */
const registerDocSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  owner_type: z.enum(["STUDENT", "GUARDIAN", "ALLOCATION", "PROPERTY", "COMPLAINT"]),
  owner_id: z.string().uuid(),
  document_type: z.string().min(1).max(40),
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
  original_filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().min(0),
});

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => registerDocSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        ...data,
        status: "AVAILABLE",
        verification_status: "PENDING",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // A resubmission (owner had only REJECTED docs, per KycUploadForm's
    // isSubmitted gate) must supersede the old rows instead of insert-only
    // stacking them — otherwise every re-upload leaves a stale REJECTED row
    // behind that keeps `hasRejected` (KycStatus.tsx) stuck true forever and
    // clutters the warden's document review with duplicates. Runs after the
    // insert succeeds, so a failed insert never leaves zero active docs.
    // There's no student-self UPDATE policy on `documents` (only
    // INSERT/SELECT), so this goes through the service-role client — the
    // insert above already proved the caller owns `owner_id` via RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: supersedeErr } = await supabaseAdmin
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("tenant_id", data.tenant_id)
      .eq("owner_type", data.owner_type)
      .eq("owner_id", data.owner_id)
      .eq("verification_status", "REJECTED")
      .neq("id", doc.id)
      .is("deleted_at", null);
    if (supersedeErr) throw new Error(supersedeErr.message);

    return { id: doc.id };
  });

/**
 * Student self-service profile edit (student.profile.tsx). The RLS self-
 * update policy + guard trigger already restrict a student to their own
 * non-staff-controlled columns, but neither enforces *format* — a raw client
 * UPDATE could (and did) save a garbage phone/email/DOB as-is. Validation
 * here is the actual fix; going through a server fn (vs. the previous direct
 * client `.update()`) means it can't be bypassed by calling Supabase directly.
 */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentSelfProfileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) throw new Error("No student record linked to your account");

    const { error } = await supabase
      .from("students")
      .update({
        full_name: data.full_name,
        phone: normalizeIndianPhone(data.phone),
        email: data.email || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        academic_institute: data.academic_institute || null,
        course_name: data.course_name || null,
        academic_year: data.academic_year || null,
      })
      .eq("id", student.id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

/**
 * Staff-side edit of a student's personal/academic fields — Hostel Admin
 * (VCED) or Warden (VE, assigned block per PRD 7 "Student profiles" row).
 * `students warden update` RLS only checks property (block_id passed as
 * NULL — see 20260715120431 migration), so per PRD 7.1 "server-side is the
 * primary guard" this handler resolves the student's *current* block via
 * their open allocation and re-checks warden_can_write_scope against it,
 * the same pattern updateGuardianPhone uses for property scope.
 */
export const updateStudentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentStaffProfileEditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select(
        "id, tenant_id, property_id, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
      )
      .eq("id", data.student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) throw new Error("Student not found");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: student.tenant_id,
      _role: "HOSTEL_ADMIN",
    });
    if (adminErr) throw new Error(adminErr.message);

    if (!isAdmin) {
      const { data: alloc, error: allocErr } = await supabase
        .from("allocations")
        .select("block_id")
        .eq("student_id", student.id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (allocErr) throw new Error(allocErr.message);

      const { data: wardenOk, error: wardenErr } = await supabase.rpc("warden_can_write_scope", {
        _user_id: userId,
        _tenant_id: student.tenant_id,
        _property_id: student.property_id,
        _block_id: alloc?.block_id ?? null,
      });
      if (wardenErr) throw new Error(wardenErr.message);
      if (!wardenOk) throw new Error("You don't have permission to edit this student's profile");
    }

    const before = {
      full_name: student.full_name,
      phone: student.phone,
      email: student.email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      academic_institute: student.academic_institute,
      course_name: student.course_name,
      academic_year: student.academic_year,
    };
    const after = {
      full_name: data.full_name,
      phone: normalizeIndianPhone(data.phone),
      email: data.email || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      academic_institute: data.academic_institute || null,
      course_name: data.course_name || null,
      academic_year: data.academic_year || null,
    };

    const { error: updErr } = await supabase.from("students").update(after).eq("id", student.id);
    if (updErr) throw new Error(updErr.message);

    // audit_logs has no client-writable INSERT policy by design — only
    // service-role can write it (see guardian.functions.ts for the same pattern).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: student.tenant_id,
      property_id: student.property_id,
      actor_user_id: userId,
      action: "STUDENT_PROFILE_UPDATED",
      entity_type: "students",
      entity_id: student.id,
      before_data: before,
      after_data: after,
    });

    return { ok: true as const };
  });
