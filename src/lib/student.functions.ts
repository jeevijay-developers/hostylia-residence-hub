import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone } from "@/schemas/auth";
import {
  classifyStudentRows,
  collectImportLookups,
  importBedKey,
  type ExistingStudentKeys,
  type ImportBed,
  type StudentImportRow,
} from "@/lib/student-import";
import {
  giveNoticeSchema,
  moveOutSettlementSchema,
  studentPhoneKey,
  validateKycFile,
} from "@/schemas/student";
import { sendStaffInviteNotification } from "@/lib/admin-staff.functions";
import { dispatchNotification } from "@/lib/dispatch-notification";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  publicAdmissionSchema,
  manualStudentRowSchema,
  allocationCreateSchema,
  swapAllocationBedSchema,
  clickConsentSchema,
  studentSelfProfileSchema,
  studentStaffProfileEditSchema,
  type AdmitStudentInput,
} from "@/schemas/student";
import type { AdmitResult, StudentAuditRow } from "@/lib/student-admit.server";

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

/** Resolves the property a public admission targets (unchanged rules, now shared with the duplicate pre-check). */
async function resolveAdmissionProperty(admin: ReturnType<typeof adminClient>, slug: string) {
  const { data: props, error: pErr } = await admin
    .from("properties")
    .select("id, tenant_id, status")
    .eq("slug", slug)
    .is("deleted_at", null)
    .limit(2);
  if (pErr) throw new Error(pErr.message);
  if (!props?.length) throw new Error("Property not found");
  if (props.length > 1) throw new Error("Property slug is ambiguous — contact the hostel");
  const property = props[0];
  // Matches listPublicActiveProperties' eligibility (ACTIVE + DRAFT) — a
  // property picked from the Select Hostel dropdown must always be
  // submittable here, even before its Hostel Admin finishes activation.
  if (!["ACTIVE", "DRAFT"].includes(property.status))
    throw new Error("Property is not accepting applications");
  return property;
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
    const { callRpc, nextAdmissionNumber } = await import("@/lib/student-admit.server");

    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_bucket_key: `admission:${ip}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (rlErr) throw new Error("Rate limiter unavailable");
    if (!allowed)
      throw new Error("Too many applications from this network. Please try again later.");

    const captcha = await verifyTurnstileToken(data.turnstileToken, ip);
    if (!captcha.ok) throw new Error(captcha.message);

    const property = await resolveAdmissionProperty(admin, data.property_slug);

    const dob = data.date_of_birth || null;
    const isMinor = dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : false;

    // A guardian's number is not the student's own: when the form fell back to
    // the guardian's phone, the student has no phone of their own. This keeps
    // siblings of one parent from colliding on that shared number.
    const studentPhone =
      studentPhoneKey(data.phone) === studentPhoneKey(data.guardian_phone) ? null : data.phone;

    // Student + guardian + link in ONE database transaction. The duplicate
    // phone/email guard lives in the database (advisory-locked trigger), so two
    // concurrent submissions of the same number cannot both succeed.
    const { data: reg, error: regErr } = await callRpc(admin, "fn_register_student", {
      p_tenant_id: property.tenant_id,
      p_property_id: property.id,
      p_admission_number: nextAdmissionNumber(),
      p_full_name: data.full_name,
      p_phone: studentPhone,
      p_email: data.email || null,
      p_date_of_birth: dob,
      p_gender: data.gender ?? null,
      p_academic_institute: data.academic_institute || null,
      p_course_name: data.course_name || null,
      p_academic_year: data.academic_year || null,
      p_is_minor: isMinor,
      p_metadata: {
        source: "public_admission",
        ip,
        ...(data.origin === "apply_form" ? { origin: "apply_form" } : {}),
      },
      p_guardian_name: data.guardian_name,
      p_guardian_phone: normalizeIndianPhone(data.guardian_phone),
      p_guardian_relationship: data.guardian_relationship,
      p_guardian_is_emergency: true,
    });
    if (regErr) throw new Error(regErr.message);
    const registered = reg as { id: string; admission_number: string };

    return { ok: true as const, admission_number: registered.admission_number };
  });

const duplicateCheckSchema = z.object({
  property_slug: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  guardian_phone: z.string().trim().max(32).optional().or(z.literal("")),
});

/**
 * PUBLIC pre-check run BEFORE an applicant's account is created: is a student
 * with this phone / email already registered in this hostel's tenant? Existence
 * only — no student details are returned. The authoritative check is the
 * database guard inside submitPublicAdmission; this just fails early and clearly.
 */
export const checkStudentAdmissionDuplicate = createServerFn({ method: "POST" })
  .validator((data) => duplicateCheckSchema.parse(data))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const admin = adminClient();
    const { callRpc } = await import("@/lib/student-admit.server");
    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_bucket_key: `admission-check:${ip}`,
      p_limit: 30,
      p_window_seconds: 3600,
    });
    if (rlErr) throw new Error("Rate limiter unavailable");
    if (!allowed) throw new Error("Too many attempts from this network. Please try again later.");

    const property = await resolveAdmissionProperty(admin, data.property_slug);
    // Same rule as submitPublicAdmission: the guardian's number is not the student's.
    const phone =
      studentPhoneKey(data.phone) === studentPhoneKey(data.guardian_phone)
        ? ""
        : (data.phone ?? "");
    const { data: taken, error } = await callRpc(admin, "fn_student_identity_taken", {
      p_tenant_id: property.tenant_id,
      p_phone: phone,
      p_email: data.email ?? "",
    });
    if (error) throw new Error(error.message);
    const t = taken as { phone_taken: boolean; email_taken: boolean };
    if (t.phone_taken) {
      return {
        duplicate: true as const,
        message: "Student already registered with this phone number.",
      };
    }
    if (t.email_taken) {
      return {
        duplicate: true as const,
        message: "Student already registered with this email address.",
      };
    }
    return { duplicate: false as const, message: null };
  });

const bulkImportSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  // Applied to every row that assigns a bed (room_number + bed_code).
  fee_plan_id: z.string().uuid().optional(),
  // Each row is validated individually in the handler so one bad row
  // doesn't reject the whole batch — this must stay loose here.
  rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
});
type BulkImportInput = z.infer<typeof bulkImportSchema>;

const LOOKUP_CHUNK = 150;

function chunked<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += LOOKUP_CHUNK) out.push(values.slice(i, i + LOOKUP_CHUNK));
  return out;
}

/** The batch's fee plan must be ACTIVE in this property; its RENT / DEPOSIT component totals. */
async function loadImportFeePlan(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  feePlanId: string,
): Promise<{ id: string; rentPaise: number | null; depositPaise: number | null }> {
  const { data: plan, error } = await supabase
    .from("fee_plans")
    .select("id, status")
    .eq("id", feePlanId)
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!plan || plan.status !== "ACTIVE") {
    throw new Error("The chosen fee plan is not active in this property");
  }
  const { data: comps, error: cErr } = await supabase
    .from("fee_plan_components")
    .select("component_type, amount_paise")
    .eq("fee_plan_id", feePlanId)
    .eq("is_active", true)
    .in("component_type", ["RENT", "DEPOSIT"]);
  if (cErr) throw new Error(cErr.message);
  const sum = (type: string) => {
    const rows = (comps ?? []).filter((c) => c.component_type === type);
    return rows.length ? rows.reduce((t, c) => t + c.amount_paise, 0) : null;
  };
  return { id: plan.id, rentPaise: sum("RENT"), depositPaise: sum("DEPOSIT") };
}

/**
 * Everything the classifier compares against, in a handful of batched reads: phones / emails
 * already registered in the tenant (the database guard is tenant-wide too), admission IDs in use
 * in this property (the unique index is per property), and the named rooms' beds.
 */
async function loadImportContext(
  supabase: SupabaseClient<Database>,
  data: BulkImportInput,
): Promise<{
  existing: ExistingStudentKeys;
  feePlan: { id: string; rentPaise: number | null; depositPaise: number | null } | null;
  today: string;
}> {
  const admit = await import("@/lib/student-admit.server");
  const { timezone } = await admit.assertPropertyInTenant(
    supabase,
    data.tenant_id,
    data.property_id,
  );
  const lookups = collectImportLookups(data.rows);
  const existing: ExistingStudentKeys = {
    phones: new Set(),
    emails: new Set(),
    admissionNumbers: new Set(),
    beds: new Map(),
  };

  const identity = async () => {
    if (lookups.phones.length === 0 && lookups.emails.length === 0) return;
    const { data: keys, error } = await admit.callRpc(
      supabase,
      "fn_existing_student_identity_keys",
      {
        p_tenant_id: data.tenant_id,
        p_property_id: data.property_id,
        p_phones: lookups.phones,
        p_emails: lookups.emails,
      },
    );
    if (error) throw new Error(error.message);
    const out = keys as { phones: string[]; emails: string[] };
    for (const k of out.phones) existing.phones.add(k);
    for (const k of out.emails) existing.emails.add(k.trim().toLowerCase());
  };

  const admissions = async () => {
    for (const part of chunked(lookups.admissionNumbers)) {
      const { data: rows, error } = await supabase
        .from("students")
        .select("admission_number")
        .eq("property_id", data.property_id)
        .is("deleted_at", null)
        .in("admission_number", part);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) existing.admissionNumbers.add(r.admission_number.toUpperCase());
    }
  };

  const beds = async () => {
    const rooms = new Map<
      string,
      { roomNumber: string; status: string; baseRentPaise: number | null }
    >();
    for (const part of chunked(lookups.roomNumbers)) {
      const { data: rows, error } = await supabase
        .from("rooms")
        .select("id, room_number, status, base_rent_paise")
        .eq("property_id", data.property_id)
        .is("deleted_at", null)
        .in("room_number", part);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        rooms.set(r.id, {
          roomNumber: r.room_number,
          status: r.status,
          baseRentPaise: r.base_rent_paise,
        });
      }
    }
    for (const part of chunked([...rooms.keys()])) {
      const { data: rows, error } = await supabase
        .from("beds")
        .select("id, room_id, code, status, rent_override_paise")
        .in("room_id", part)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      for (const b of rows ?? []) {
        const room = rooms.get(b.room_id);
        if (!room) continue;
        const bed: ImportBed = {
          bedId: b.id,
          roomNumber: room.roomNumber,
          code: b.code,
          status: b.status,
          roomStatus: room.status,
          rentPaise: b.rent_override_paise ?? room.baseRentPaise,
        };
        existing.beds.set(importBedKey(room.roomNumber, b.code), bed);
      }
    }
  };

  const [feePlan] = await Promise.all([
    data.fee_plan_id
      ? loadImportFeePlan(supabase, data.property_id, data.fee_plan_id)
      : Promise.resolve(null),
    identity(),
    admissions(),
    beds(),
  ]);
  return { existing, feePlan, today: admit.todayInTimezone(timezone) };
}

export type StudentImportErrorKind = "DUPLICATE" | "FAILED";
type StudentImportError = { row: number; error: string; kind: StudentImportErrorKind };

function skippedRowError(c: StudentImportRow): StudentImportError | null {
  if (c.status === "INVALID") return { row: c.row, error: c.error, kind: "FAILED" };
  if (c.status === "DUPLICATE") return { row: c.row, error: c.error, kind: "DUPLICATE" };
  return null;
}

/** Read-only dry run for the Bulk import dialog: what would be imported, skipped as duplicate, or rejected. */
export const previewStudentImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => bulkImportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { existing, feePlan } = await loadImportContext(context.supabase, data);
    const classified = classifyStudentRows(data.rows, existing, { hasFeePlan: feePlan !== null });
    const errors: StudentImportError[] = [];
    let ok = 0;
    for (const c of classified) {
      const err = skippedRowError(c);
      if (err) errors.push(err);
      else ok += 1;
    }
    return {
      ok,
      duplicates: errors.filter((e) => e.kind === "DUPLICATE").length,
      failed: errors.filter((e) => e.kind === "FAILED").length,
      errors,
    };
  });

/**
 * Imports the file row by row. Each importable row is admitted in its own database transaction
 * (student + guardian + optional bed + optional opening dues and offline payment), so a failing
 * row leaves nothing behind and never blocks the rows after it.
 */
export const bulkImportStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => bulkImportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admit = await import("@/lib/student-admit.server");
    const { existing, feePlan, today } = await loadImportContext(supabase, data);
    const classified = classifyStudentRows(data.rows, existing, { hasFeePlan: feePlan !== null });

    const errors: StudentImportError[] = [];
    const auditSink: StudentAuditRow[] = [];
    let inserted = 0;
    let allocated = 0;
    let invoiced = 0;

    for (const c of classified) {
      if (c.status !== "OK") {
        const err = skippedRowError(c);
        if (err) errors.push(err);
        continue;
      }
      const d = c.data;
      const n = c.normalized;
      const hasGuardian = Boolean(d.guardian_name && d.guardian_phone);
      const input: AdmitStudentInput = {
        tenant_id: data.tenant_id,
        property_id: data.property_id,
        full_name: d.full_name,
        admission_number: n.admissionNumber,
        phone: d.phone ?? "",
        email: d.email ?? "",
        date_of_birth: d.date_of_birth ?? "",
        gender: n.gender,
        academic_institute: d.academic_institute ?? "",
        course_name: d.course_name ?? "",
        academic_year: d.academic_year ?? "",
        guardian_name: d.guardian_name ?? "",
        guardian_phone: d.guardian_phone ?? "",
        guardian_relationship: hasGuardian ? d.guardian_relationship || "Guardian" : "",
        guardian_email: d.guardian_email ?? "",
        initial_status: n.initialStatus,
        placement:
          n.bed && feePlan
            ? {
                bed_id: n.bed.bedId,
                fee_plan_id: feePlan.id,
                start_date: d.start_date || today,
                rent_snapshot_paise: n.bed.rentPaise ?? feePlan.rentPaise ?? 0,
                deposit_snapshot_paise: feePlan.depositPaise ?? 0,
              }
            : undefined,
        charge:
          n.duesPaise > 0
            ? {
                amount_paise: n.duesPaise,
                due_date: today,
                note: "Imported from CSV",
                payment: n.payment
                  ? {
                      amount_paise: n.payment.amountPaise,
                      mode: n.payment.mode,
                      reference: n.payment.reference,
                      cheque_date: "",
                    }
                  : undefined,
              }
            : undefined,
      };
      try {
        const result = await admit.admitStudentRow(supabase, userId, input, {
          source: "BULK_IMPORT",
          auditSink,
          today,
        });
        inserted += 1;
        if (result.allocation_id) allocated += 1;
        if (result.invoice_id) invoiced += 1;
      } catch (e) {
        if (e instanceof admit.StudentAdmitError) {
          // Lost a race with another writer of the same phone/email/admission ID: still a
          // duplicate, and the row's transaction left nothing behind.
          const isDuplicate = e.kind === "DUPLICATE_IDENTITY" || e.kind === "DUPLICATE_ADMISSION";
          errors.push({ row: c.row, error: e.message, kind: isDuplicate ? "DUPLICATE" : "FAILED" });
        } else {
          errors.push({
            row: c.row,
            error: e instanceof Error ? e.message : "Could not import this row",
            kind: "FAILED",
          });
        }
      }
    }

    await admit.writeStudentAudit(auditSink);

    return {
      inserted,
      allocated,
      invoiced,
      duplicates: errors.filter((e) => e.kind === "DUPLICATE").length,
      failed: errors.filter((e) => e.kind === "FAILED").length,
      errors,
    };
  });

const manualCreateSchema = manualStudentRowSchema.extend({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
});

/**
 * Direct student portal onboarding (Admin → Add Student): provisions a real
 * login-able account for the student right away instead of waiting for them
 * to self-register and be matched later (the older `confirmStudentAdmission`
 * path, which still exists unchanged for students who signed up on their
 * own). Reuses the exact same invite + set-password mechanism as staff
 * (`inviteStaff`'s create-user-if-missing + `sendStaffInviteNotification`,
 * which emails a Supabase `recovery`-type link landing on /reset-password),
 * just linked immediately (is_active: true) rather than left PENDING —
 * there's no separate "accept" step for a student the Admin just created.
 * Best-effort: the student record must exist regardless of whether the
 * invite email/account provisioning succeeds (same philosophy as
 * `inviteStaff`), so every failure here is swallowed and logged — but the
 * reason is returned so the caller can still surface it to the admin (the
 * student record is fine either way, only the portal invite didn't go out).
 */
export async function provisionStudentPortalAccount(
  supabase: SupabaseClient<Database>,
  granterId: string,
  student: { id: string; tenant_id: string; property_id: string; full_name: string; email: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let inviteeId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", student.email)
      .limit(1);
    if (existing && existing.length) inviteeId = existing[0].id;

    if (!inviteeId) {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: student.email,
        email_confirm: false,
        user_metadata: { full_name: student.full_name },
      });
      if (cErr) throw cErr;
      inviteeId = created.user?.id ?? null;
    }
    if (!inviteeId) throw new Error("could not create student account");

    const { data: already } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", inviteeId)
      .is("deleted_at", null)
      .limit(1);
    if (already && already.length) {
      throw new Error("That email is already linked to another student record");
    }

    const { error: linkErr } = await supabase
      .from("students")
      .update({ profile_id: inviteeId, portal_access_enabled: true })
      .eq("id", student.id);
    if (linkErr) throw new Error(linkErr.message);

    // tenant_memberships/role_assignments RLS only grants writes to
    // HOSTEL_ADMIN, so a Warden's request-scoped client would be denied here
    // even though createStudentManual itself allows Warden — same blind spot
    // confirmStudentAdmission already works around with the service-role client.
    const nowIso = new Date().toISOString();
    const { error: mErr } = await supabaseAdmin
      .from("tenant_memberships")
      .upsert(
        { tenant_id: student.tenant_id, user_id: inviteeId, status: "ACTIVE", joined_at: nowIso },
        { onConflict: "tenant_id,user_id" },
      );
    if (mErr) throw new Error(mErr.message);

    const { error: rErr } = await supabaseAdmin.from("role_assignments").insert({
      tenant_id: student.tenant_id,
      user_id: inviteeId,
      role: "STUDENT",
      property_id: student.property_id,
      is_active: true,
      granted_by: granterId,
      granted_at: nowIso,
    });
    if (rErr) throw new Error(rErr.message);

    // Awaited, but never blocks meaningfully — the student record is already
    // saved; this only waits for the invite notification job to be queued,
    // not for actual delivery (see the matching comment in
    // admin-staff.functions.ts for why `void` fire-and-forget is unsafe on
    // Cloudflare Workers).
    await sendStaffInviteNotification(supabase, {
      inviteeId,
      email: student.email,
      phone: null,
      role: "STUDENT",
      tenantId: student.tenant_id,
      propertyId: student.property_id,
      referenceId: student.id,
    });
    return { ok: true };
  } catch (e) {
    console.warn("provisionStudentPortalAccount failed (student record was still created)", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Could not set up portal access" };
  }
}

/**
 * Single-student manual add for Admin/Warden (legacy dialog shape). Same transactional admit path
 * as the Students tab and the bulk import, without a bed or opening dues.
 */
export const createStudentManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => manualCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admit = await import("@/lib/student-admit.server");
    const { timezone } = await admit.assertPropertyInTenant(
      supabase,
      data.tenant_id,
      data.property_id,
    );
    const gender = (data.gender ?? "").trim().toUpperCase();
    let student: AdmitResult;
    try {
      student = await admit.admitStudentRow(
        supabase,
        userId,
        {
          tenant_id: data.tenant_id,
          property_id: data.property_id,
          full_name: data.full_name,
          admission_number: "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          date_of_birth: data.date_of_birth ?? "",
          gender: gender === "MALE" || gender === "FEMALE" || gender === "OTHER" ? gender : "",
          academic_institute: data.academic_institute ?? "",
          course_name: data.course_name ?? "",
          academic_year: "",
          guardian_name: data.guardian_name,
          guardian_phone: data.guardian_phone,
          guardian_relationship: "Guardian",
          guardian_email: "",
          initial_status: "APPLICANT",
        },
        { today: admit.todayInTimezone(timezone) },
      );
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Could not add the student");
    }
    let portalWarning: string | undefined;
    if (data.email && data.email.trim()) {
      const result = await provisionStudentPortalAccount(supabase, userId, {
        id: student.student_id,
        tenant_id: data.tenant_id,
        property_id: data.property_id,
        full_name: data.full_name,
        email: data.email.trim(),
      });
      if (!result.ok) portalWarning = result.reason;
    }
    return { id: student.student_id, admission_number: student.admission_number, portalWarning };
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
      .select("id, tenant_id, property_id, phone, email, profile_id, full_name, admission_number")
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

    if (!isAdmin) {
      // Write-scope (not just read) since this ultimately updates the
      // student row itself — matches the "students warden update" RLS
      // policy, which also checks warden_can_write_scope with a null
      // block_id (admission confirmation happens before any allocation).
      const { data: wardenOk, error: wardenErr } = await supabase.rpc("warden_can_write_scope", {
        _user_id: userId,
        _tenant_id: student.tenant_id,
        _property_id: student.property_id,
        _block_id: null as unknown as string,
      });
      if (wardenErr) throw new Error(wardenErr.message);
      if (!wardenOk) throw new Error("Only a Hostel Admin or Warden can confirm admissions");
    }

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

    // tenant_memberships/role_assignments RLS only grants writes to
    // HOSTEL_ADMIN (see 20260729103833_add_tenant_membership_role_assignment_write_policies.sql),
    // so a Warden's request-scoped client would be denied here even though
    // they were just authorized above — use the service-role client for
    // just these two writes now that the caller (Admin or in-scope Warden)
    // has already been validated.
    const { error: mErr } = await supabaseAdmin.from("tenant_memberships").upsert(
      {
        tenant_id: student.tenant_id,
        user_id: matchedId,
        status: "ACTIVE",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (mErr) throw new Error(mErr.message);

    const { error: rErr } = await supabaseAdmin.from("role_assignments").insert({
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

    try {
      const phone = student.phone?.trim();
      if (phone) {
        const { data: property } = await supabase
          .from("properties")
          .select("name")
          .eq("id", student.property_id)
          .maybeSingle();
        await dispatchNotification(supabase, {
          channel: "SMS",
          templateKey: "admission_approved",
          recipient: { phone },
          variables: {
            name: student.full_name ?? "Student",
            admission_id: student.admission_number ?? student.id.slice(0, 8),
            hostel: property?.name ?? "hostel",
          },
          eventType: "ADMISSION_APPROVED",
          tenantId: student.tenant_id,
          propertyId: student.property_id,
          referenceId: student.id,
        });
      }
    } catch (e) {
      console.warn("[confirmStudentAdmission] SMS notify failed", e);
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
    if (aErr) {
      // 23505 = uidx_allocations_active_student — the student already has an
      // open allocation (PENDING_AGREEMENT/PENDING_PAYMENT/ACTIVE/
      // NOTICE_GIVEN/MOVE_OUT_INSPECTION). The Allocate Bed dialog checks for
      // this up front and offers Swap instead, but this stays as a
      // defense-in-depth guard against a race (e.g. two admins allocating
      // the same student at once) so the raw Postgres error never reaches
      // the toast.
      if ((aErr as { code?: string }).code === "23505") {
        throw new Error(
          "This student already has an active or pending allocation. Use Swap bed instead.",
        );
      }
      throw new Error(aErr.message);
    }

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
      //
      // Uses the service-role admin client, not the caller's own `supabase`:
      // this handler runs as the student themselves (acceptAgreementClickwrap
      // is student-invoked), but `fee_plan_components` has no student SELECT
      // policy and `invoices` has no student INSERT policy (invoices_staff_insert
      // requires can_create_invoices — staff-only). Under the student's own
      // RLS, the components read silently comes back empty and the invoice
      // insert is rejected by RLS; that rejection was being thrown here and
      // then swallowed by this same try/catch, so no invoice was ever created
      // and nothing surfaced the failure.
      try {
        await generateFirstInvoiceForAllocation(adminClient(), agr.allocation_id);
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
    invoice_number: "",
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

/**
 * PRD 6.2.3 one-tap bed swap: moves a student's existing open allocation to
 * a different vacant bed in the same property, atomically, without closing
 * or recreating the allocation — the agreement, invoices, and payment
 * history all stay attached to the same allocation_id. Used by the Allocate
 * Bed dialog when the picked student already has an open allocation, as the
 * alternative to (blocked) re-allocation.
 */
export const swapAllocationBed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => swapAllocationBedSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Atomic in one DB function per RULES.md 19.3/19.5 (no independent
    // allocation.bed_id / bed.status writes from the client).
    const { error } = await supabase.rpc("swap_allocation_bed", {
      p_allocation_id: data.allocation_id,
      p_new_bed_id: data.new_bed_id,
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

/**
 * Student submits a move-out notice. ACTIVE -> NOTICE_GIVEN only; the
 * give_notice RPC verifies the allocation belongs to the caller, enforces a
 * single notice and the notice-period/lock-in minimum date, notifies staff,
 * and leaves the allocation open and the bed OCCUPIED.
 */
export const giveNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => giveNoticeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("give_notice", {
      p_allocation_id: data.allocation_id,
      p_requested_move_out_date: data.requested_move_out_date,
      p_reason: data.reason,
      p_remarks: data.remarks || undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const previewMoveOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ allocation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: eDate }, { data: refund }, settlementRes] = await Promise.all([
      supabase.rpc("earliest_move_out_date", { p_allocation_id: data.allocation_id }),
      supabase.rpc("provisional_refund_paise", { p_allocation_id: data.allocation_id }),
      supabase.rpc("move_out_settlement", { p_allocation_id: data.allocation_id }),
    ]);

    // The invoice-wise settlement is only available to staff who may move the
    // allocation out (or manage refunds); everyone else just gets the two
    // legacy figures, exactly as before.
    const parsed = settlementRes.error
      ? null
      : moveOutSettlementSchema.safeParse(settlementRes.data);
    const settlement = parsed?.success ? parsed.data : null;

    // Real, captured payments of this allocation's invoices that still have
    // room for a refund — a deposit refund must hang off one of these
    // (refunds.payment_id is NOT NULL; no payment rows are ever invented).
    let refundPayments: { id: string; payment_number: string; remaining_paise: number }[] = [];
    if (settlement && settlement.refundable_paise > 0) {
      const { data: pays } = await supabase
        .from("payments")
        .select("id, payment_number, amount_paise, paid_at, invoice:invoices!inner(allocation_id)")
        .eq("invoice.allocation_id", data.allocation_id)
        .eq("status", "CAPTURED")
        .or("provider.is.null,provider.neq.simulated")
        .order("paid_at", { ascending: true });
      const ids = (pays ?? []).map((p) => p.id);
      const { data: existing } = ids.length
        ? await supabase
            .from("refunds")
            .select("payment_id, amount_paise")
            .in("payment_id", ids)
            .not("status", "in", "(REJECTED,CANCELLED,FAILED)")
        : { data: [] as { payment_id: string; amount_paise: number }[] };
      const used = new Map<string, number>();
      for (const r of existing ?? []) {
        used.set(r.payment_id, (used.get(r.payment_id) ?? 0) + r.amount_paise);
      }
      refundPayments = (pays ?? [])
        .map((p) => ({
          id: p.id,
          payment_number: p.payment_number,
          remaining_paise: p.amount_paise - (used.get(p.id) ?? 0),
        }))
        .filter((p) => p.remaining_paise > 0);
    }

    return {
      earliest_move_out_date: eDate as string | null,
      provisional_refund_paise: (refund as number | null) ?? 0,
      settlement,
      refund_payments: refundPayments,
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

    // Per-document-type format/size rules (AADHAAR/COLLEGE_ID: JPG, PNG, PDF;
    // PHOTO: JPG, PNG; OTHER: whatever the bucket allows). The same rules are
    // enforced at the database by fn_validate_kyc_document, which also covers
    // direct inserts that never reach this function.
    if (data.owner_type === "STUDENT" && data.storage_bucket === "kyc-documents") {
      const invalid = validateKycFile(
        { name: data.original_filename, type: data.mime_type, size: data.size_bytes },
        data.document_type,
      );
      if (invalid) throw new Error(invalid);
    }

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
 * Undo a complaint submission whose photo step failed, so a retry doesn't leave
 * a photo-less duplicate complaint or an orphaned storage object behind.
 * Students have no delete rights on `complaints` or `complaint-media`, so this
 * runs with the service role — gated on the caller owning the complaint, it
 * being brand new, and it having no registered attachment.
 */
const discardFailedComplaintSchema = z.object({
  complaint_id: z.string().uuid(),
  storage_path: z.string().min(1).optional(),
});

export const discardFailedComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => discardFailedComplaintSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS: a student can only see their own complaints.
    const { data: complaint, error: cErr } = await supabase
      .from("complaints")
      .select("id, tenant_id, property_id, student_id, created_at")
      .eq("id", data.complaint_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!complaint) return { ok: true as const };

    const { data: owned } = await supabase
      .from("students")
      .select("id")
      .eq("id", complaint.student_id)
      .eq("profile_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("Not allowed");

    const ageMs = Date.now() - new Date(complaint.created_at).getTime();
    if (ageMs > 10 * 60_000) throw new Error("Complaint is too old to discard");

    const admin = adminClient();
    const { count: docCount } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_type", "COMPLAINT")
      .eq("owner_id", complaint.id)
      .is("deleted_at", null);
    if ((docCount ?? 0) > 0) return { ok: true as const };

    const prefix = `${complaint.tenant_id}/${complaint.property_id}/${complaint.id}/`;
    if (data.storage_path?.startsWith(prefix)) {
      await admin.storage.from("complaint-media").remove([data.storage_path]);
    }
    const { error } = await admin
      .from("complaints")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", complaint.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
        _block_id: (alloc?.block_id ?? null) as string,
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
