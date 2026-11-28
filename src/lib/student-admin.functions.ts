/**
 * Students tab (property) staff actions: admit, edit details, one-off charges, review-status moves,
 * staff-recorded move-out notices, and the edit snapshot. Every write runs under the caller's RLS
 * client; the lifecycle moves go through RPCs that validate the transition themselves, so the
 * client never writes students.status directly.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone } from "@/schemas/auth";
import {
  addStudentChargeSchema,
  admitStudentSchema,
  staffGiveNoticeSchema,
  studentReviewStatusSchema,
  updateStudentDetailsSchema,
  type StudentDetailsInput,
} from "@/schemas/student";
import { provisionStudentPortalAccount } from "@/lib/student.functions";
import type { AdmitResult } from "@/lib/student-admit.server";

type Client = SupabaseClient<Database>;

const OPEN_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PARTIALLY_REFUNDED"];
const MAX_OPEN_INVOICES = 20;

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Live (not archived) student, readable under the caller's RLS. */
async function loadLiveStudent(supabase: Client, studentId: string) {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, tenant_id, property_id, deleted_at, full_name, admission_number, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Student not found");
  if (data.deleted_at) throw new Error("This student is archived and can't be changed");
  return data;
}

interface PrimaryGuardianLink {
  linkId: string;
  relationship: string;
  guardian: { id: string; full_name: string; phone: string; email: string | null } | null;
}

async function loadPrimaryGuardian(
  supabase: Client,
  studentId: string,
): Promise<PrimaryGuardianLink | null> {
  const { data, error } = await supabase
    .from("student_guardians")
    .select("id, relationship, guardian:guardians(id, full_name, phone, email)")
    .eq("student_id", studentId)
    .eq("is_primary", true)
    .is("unlinked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { linkId: data.id, relationship: data.relationship, guardian: data.guardian };
}

/* ------------------------------------------------------------------------- */
/* Admit                                                                      */
/* ------------------------------------------------------------------------- */

/** Add student (Students tab): one transaction, then portal invite when an email was given. */
export const admitStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => admitStudentSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdmitResult & { portalWarning?: string }> => {
    const { supabase, userId } = context;
    const admit = await import("@/lib/student-admit.server");
    const { timezone } = await admit.assertPropertyInTenant(
      supabase,
      data.tenant_id,
      data.property_id,
    );

    let result: AdmitResult;
    try {
      result = await admit.admitStudentRow(supabase, userId, data, {
        source: "MANUAL",
        today: admit.todayInTimezone(timezone),
      });
    } catch (e) {
      throw new Error(errorMessage(e, "Could not add the student"));
    }

    let portalWarning: string | undefined;
    const email = (data.email ?? "").trim();
    if (email) {
      const portal = await provisionStudentPortalAccount(supabase, userId, {
        id: result.student_id,
        tenant_id: data.tenant_id,
        property_id: data.property_id,
        full_name: data.full_name.trim(),
        email,
      });
      if (!portal.ok) portalWarning = portal.reason;
    }
    return { ...result, portalWarning };
  });

/* ------------------------------------------------------------------------- */
/* Edit details + primary guardian                                            */
/* ------------------------------------------------------------------------- */

type GuardianValues = { full_name: string; phone: string; email: string | null };

/**
 * Updates the linked primary guardian, or links one (re-using the tenant's guardian with the same
 * phone, exactly like fn_register_student) when the student has none yet.
 */
async function savePrimaryGuardian(
  supabase: Client,
  tenantId: string,
  studentId: string,
  link: PrimaryGuardianLink | null,
  next: GuardianValues & { relationship: string },
): Promise<void> {
  const { classifyStudentDbError } = await import("@/lib/student-admit.server");
  const fail = (e: { message: string; code?: string }) => {
    throw new Error(classifyStudentDbError(e).message);
  };

  if (link?.guardian) {
    const g = link.guardian;
    if (g.full_name !== next.full_name || g.phone !== next.phone || g.email !== next.email) {
      const { data, error } = await supabase
        .from("guardians")
        .update({ full_name: next.full_name, phone: next.phone, email: next.email })
        .eq("id", g.id)
        .eq("tenant_id", tenantId)
        .select("id");
      if (error) fail(error);
      if (!data?.length) throw new Error("You don't have permission to edit this guardian");
    }
    if (link.relationship !== next.relationship) {
      const { error } = await supabase
        .from("student_guardians")
        .update({ relationship: next.relationship })
        .eq("id", link.linkId);
      if (error) fail(error);
    }
    return;
  }

  const { data: found, error: findErr } = await supabase
    .from("guardians")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .eq("phone", next.phone)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) fail(findErr);

  let guardianId: string;
  if (found) {
    guardianId = found.id;
    // A shared guardian is never overwritten; only a missing email is filled in.
    if (!found.email && next.email) {
      const { error } = await supabase
        .from("guardians")
        .update({ email: next.email })
        .eq("id", found.id);
      if (error) fail(error);
    }
  } else {
    const { data: created, error } = await supabase
      .from("guardians")
      .insert({
        tenant_id: tenantId,
        full_name: next.full_name,
        phone: next.phone,
        email: next.email,
      })
      .select("id")
      .single();
    if (error || !created) return fail(error ?? { message: "Could not add the guardian" });
    guardianId = created.id;
  }

  // (student_id, guardian_id) is unique, so an old unlinked / secondary link is promoted instead.
  const { data: existingLink, error: linkErr } = await supabase
    .from("student_guardians")
    .select("id")
    .eq("student_id", studentId)
    .eq("guardian_id", guardianId)
    .maybeSingle();
  if (linkErr) fail(linkErr);
  const linkValues = {
    relationship: next.relationship,
    is_primary: true,
    is_emergency_contact: true,
    unlinked_at: null,
  };
  const { error: saveErr } = existingLink
    ? await supabase.from("student_guardians").update(linkValues).eq("id", existingLink.id)
    : await supabase.from("student_guardians").insert({
        ...linkValues,
        tenant_id: tenantId,
        student_id: studentId,
        guardian_id: guardianId,
      });
  if (saveErr) fail(saveErr);
}

export const updateStudentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateStudentDetailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admit = await import("@/lib/student-admit.server");
    const student = await loadLiveStudent(supabase, data.student_id);
    await admit.assertCanEditStudents(supabase, userId, student.tenant_id, student.property_id);
    const link = await loadPrimaryGuardian(supabase, student.id);

    const before = {
      full_name: student.full_name,
      admission_number: student.admission_number,
      phone: student.phone,
      email: student.email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      academic_institute: student.academic_institute,
      course_name: student.course_name,
      academic_year: student.academic_year,
    };
    const customAdmission = (data.admission_number ?? "").trim().toUpperCase();
    const after = {
      full_name: data.full_name.trim(),
      // Blank keeps the current ID: an admission ID is never removed, only replaced.
      admission_number: customAdmission || student.admission_number,
      phone: data.phone ? normalizeIndianPhone(data.phone) : null,
      email: data.email?.trim() || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      academic_institute: data.academic_institute?.trim() || null,
      course_name: data.course_name?.trim() || null,
      academic_year: data.academic_year?.trim() || null,
    };

    const { data: updated, error: updErr } = await supabase
      .from("students")
      .update(after)
      .eq("id", student.id)
      .select("id");
    if (updErr) throw new Error(admit.classifyStudentDbError(updErr).message);
    if (!updated?.length) throw new Error("You don't have permission to edit this student");

    const guardianBefore = link?.guardian
      ? {
          full_name: link.guardian.full_name,
          phone: link.guardian.phone,
          email: link.guardian.email,
          relationship: link.relationship,
        }
      : null;
    const guardianAfter = {
      full_name: data.guardian_name.trim(),
      phone: normalizeIndianPhone(data.guardian_phone),
      email: data.guardian_email?.trim() || null,
      relationship: data.guardian_relationship.trim(),
    };
    try {
      await savePrimaryGuardian(supabase, student.tenant_id, student.id, link, guardianAfter);
    } catch (e) {
      throw new Error(
        `Student details were saved, but the guardian could not be updated: ${errorMessage(e, "unknown error")}`,
      );
    }

    await admit.writeStudentAudit([
      {
        tenant_id: student.tenant_id,
        property_id: student.property_id,
        actor_user_id: userId,
        action: "STUDENT_PROFILE_UPDATED",
        entity_type: "students",
        entity_id: student.id,
        before_data: { ...before, guardian: guardianBefore },
        after_data: { ...after, guardian: guardianAfter },
      },
    ]);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------------- */
/* Money                                                                      */
/* ------------------------------------------------------------------------- */

/** One-off charge (own ISSUED invoice), optionally paid offline in the same transaction. */
export const addStudentCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => addStudentChargeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admit = await import("@/lib/student-admit.server");
    const student = await loadLiveStudent(supabase, data.student_id);
    const payment = data.payment;
    const note = data.note?.trim() || null;

    const { data: raw, error } = await admit.callRpc(supabase, "fn_add_student_charge", {
      p_student_id: student.id,
      p_amount_paise: data.amount_paise,
      p_due_date: data.due_date,
      p_note: note,
      p_payment_amount_paise: payment?.amount_paise ?? null,
      p_payment_mode: payment?.mode ?? null,
      p_payment_reference: payment?.reference?.trim() || null,
      p_cheque_date: payment?.cheque_date || null,
    });
    if (error) throw new Error(admit.classifyStudentDbError(error).message);
    const parsed = admit.chargeRpcResultSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[addStudentCharge] unexpected fn_add_student_charge result", raw);
      throw new Error(
        "The charge was saved, but the response could not be read. Refresh to see it.",
      );
    }
    const result = parsed.data;

    const receiptWarning = result.payment_id
      ? await admit.generateReceiptBestEffort(supabase, result.payment_id)
      : undefined;

    await admit.writeStudentAudit(
      admit.chargeAuditRows({
        tenantId: student.tenant_id,
        propertyId: student.property_id,
        userId,
        studentId: student.id,
        invoiceId: result.invoice_id,
        invoiceNumber: result.invoice_number,
        amountPaise: data.amount_paise,
        dueDate: data.due_date,
        note,
        payment:
          result.payment_id && payment
            ? {
                id: result.payment_id,
                number: result.payment_number,
                amountPaise: payment.amount_paise,
                mode: payment.mode,
                reference: payment.reference?.trim() || null,
              }
            : null,
      }),
    );

    return {
      invoice_id: result.invoice_id,
      invoice_number: result.invoice_number,
      payment_id: result.payment_id,
      payment_number: result.payment_number,
      receiptWarning,
    };
  });

/* ------------------------------------------------------------------------- */
/* Lifecycle moves                                                            */
/* ------------------------------------------------------------------------- */

/** APPLICANT <-> VERIFIED, APPLICANT|VERIFIED -> REJECTED, REJECTED -> APPLICANT (DB-validated). */
export const setStudentReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentReviewStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admit = await import("@/lib/student-admit.server");
    const { error } = await admit.callRpc(context.supabase, "fn_set_student_review_status", {
      p_student_id: data.student_id,
      p_status: data.status,
      p_reason: data.reason?.trim() || null,
    });
    if (error) throw new Error(admit.classifyStudentDbError(error).message);
    return { ok: true as const };
  });

/** Staff records an ACTIVE student's move-out notice (same rules as the student's own give_notice). */
export const staffGiveNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => staffGiveNoticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admit = await import("@/lib/student-admit.server");
    const { error } = await admit.callRpc(context.supabase, "fn_staff_give_notice", {
      p_allocation_id: data.allocation_id,
      p_requested_move_out_date: data.requested_move_out_date,
      p_reason: data.reason.trim(),
      p_remarks: data.remarks?.trim() || null,
    });
    if (error) throw new Error(admit.classifyStudentDbError(error).message);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------------- */
/* Edit snapshot                                                              */
/* ------------------------------------------------------------------------- */

export interface StudentEditSnapshot {
  id: string;
  tenant_id: string;
  property_id: string;
  status: string;
  deleted_at: string | null;
  profile_id: string | null;
  /** Form-ready: nulls become "", guardian_* come from the primary guardian (or ""). */
  details: StudentDetailsInput;
  openAllocation: {
    id: string;
    status: string;
    block_id: string | null;
    room: string | null;
    bed: string | null;
    start_date: string;
    requested_move_out_date: string | null;
  } | null;
  /** Unpaid invoices, newest first (at most 20). */
  openInvoices: {
    id: string;
    invoice_number: string;
    due_date: string;
    status: string;
    balance_paise: number;
    total_paise: number;
    notes: string | null;
  }[];
  /** Total outstanding across ALL open invoices. */
  duesPaise: number;
}

function formGender(value: string | null): StudentDetailsInput["gender"] {
  const g = (value ?? "").trim().toUpperCase();
  return g === "MALE" || g === "FEMALE" || g === "OTHER" ? g : "";
}

/** Read-only (RLS) snapshot backing the Edit student dialog and Record payment. */
export const getStudentForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ student_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<StudentEditSnapshot> => {
    const { supabase } = context;
    const { OPEN_ALLOCATION_STATUSES } = await import("@/lib/student-admit.server");

    const { data: s, error } = await supabase
      .from("students")
      .select(
        "id, tenant_id, property_id, status, deleted_at, profile_id, full_name, admission_number, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
      )
      .eq("id", data.student_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) throw new Error("Student not found");

    const [link, allocRes, invoicesRes, duesRes] = await Promise.all([
      loadPrimaryGuardian(supabase, s.id),
      supabase
        .from("allocations")
        .select(
          "id, status, block_id, start_date, requested_move_out_date, room:rooms(room_number), bed:beds(code)",
        )
        .eq("student_id", s.id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("id, invoice_number, due_date, status, balance_paise, total_paise, notes")
        .eq("student_id", s.id)
        .in("status", OPEN_INVOICE_STATUSES)
        .gt("balance_paise", 0)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_OPEN_INVOICES),
      supabase
        .from("invoices")
        .select("balance_paise")
        .eq("student_id", s.id)
        .in("status", OPEN_INVOICE_STATUSES)
        .gt("balance_paise", 0)
        .is("deleted_at", null),
    ]);
    if (allocRes.error) throw new Error(allocRes.error.message);
    if (invoicesRes.error) throw new Error(invoicesRes.error.message);
    if (duesRes.error) throw new Error(duesRes.error.message);

    const alloc = allocRes.data;
    return {
      id: s.id,
      tenant_id: s.tenant_id,
      property_id: s.property_id,
      status: s.status,
      deleted_at: s.deleted_at,
      profile_id: s.profile_id,
      details: {
        full_name: s.full_name,
        admission_number: s.admission_number,
        phone: s.phone ?? "",
        email: s.email ?? "",
        date_of_birth: s.date_of_birth ?? "",
        gender: formGender(s.gender),
        academic_institute: s.academic_institute ?? "",
        course_name: s.course_name ?? "",
        academic_year: s.academic_year ?? "",
        guardian_name: link?.guardian?.full_name ?? "",
        guardian_phone: link?.guardian?.phone ?? "",
        guardian_relationship: link?.relationship ?? "",
        guardian_email: link?.guardian?.email ?? "",
      },
      openAllocation: alloc
        ? {
            id: alloc.id,
            status: alloc.status,
            block_id: alloc.block_id,
            room: alloc.room?.room_number ?? null,
            bed: alloc.bed?.code ?? null,
            start_date: alloc.start_date,
            requested_move_out_date: alloc.requested_move_out_date,
          }
        : null,
      openInvoices: invoicesRes.data ?? [],
      duesPaise: (duesRes.data ?? []).reduce((sum, i) => sum + i.balance_paise, 0),
    };
  });
