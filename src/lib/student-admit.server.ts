/**
 * Server-only helpers behind "Add student", the bulk CSV import and the Students-tab money actions.
 *
 * Every database write goes through the caller's request-scoped (RLS) client and a SECURITY
 * INVOKER RPC, so the caller's own permissions apply; the service-role client is used only for
 * audit_logs, which has no client INSERT policy by design. Messages on `StudentAdmitError` are
 * written for the person filling the form (no ids, no SQL).
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeIndianPhone } from "@/schemas/auth";
import type { AdmitStudentInput } from "@/schemas/student";

type Client = SupabaseClient<Database>;

export type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

// fn_register_student, fn_admit_student & co. are not in the generated types until they are
// regenerated from the migrated schema; drop this wrapper then.
export async function callRpc(
  supabase: object,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const client = supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  };
  return await client.rpc(fn, args);
}

/** Matches uidx_allocations_active_student: the statuses that count as a current stay. */
export const OPEN_ALLOCATION_STATUSES = [
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
];

/** Generated admission ID, e.g. "A26-K3J9QX". Random, so a (rare) clash is retried by admitStudentRow. */
export function nextAdmissionNumber(): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  return `A${y}-${rand}`;
}

/** Calendar date "YYYY-MM-DD" in the given IANA zone (properties.timezone), Asia/Kolkata fallback. */
export function todayInTimezone(timeZone?: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  try {
    return format(timeZone || "Asia/Kolkata");
  } catch {
    return format("Asia/Kolkata");
  }
}

/** Under 18 on `today` (both "YYYY-MM-DD"); false when the DOB is unknown. */
export function isMinorOn(dob: string | null, today: string): boolean {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age < 18;
}

/**
 * The property must exist under the caller's RLS AND belong to the tenant the browser named —
 * tenant_id is client-supplied and never trusted on its own. Returns the property's timezone.
 */
export async function assertPropertyInTenant(
  supabase: Client,
  tenantId: string,
  propertyId: string,
): Promise<{ timezone: string }> {
  const { data, error } = await supabase
    .from("properties")
    .select("tenant_id, timezone")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.tenant_id !== tenantId) throw new Error("Property not found");
  return { timezone: data.timezone };
}

/** Hostel Admin, or staff holding the students_edit permission on this property. */
export async function assertCanEditStudents(
  supabase: Client,
  userId: string,
  tenantId: string,
  propertyId: string,
): Promise<void> {
  const [{ data: isAdmin, error: adminErr }, { data: canEdit, error: editErr }] = await Promise.all(
    [
      supabase.rpc("has_tenant_role", {
        _user_id: userId,
        _tenant_id: tenantId,
        _role: "HOSTEL_ADMIN",
      }),
      supabase.rpc("can_edit_students", {
        _user_id: userId,
        _tenant_id: tenantId,
        _property_id: propertyId,
      }),
    ],
  );
  if (adminErr) throw new Error(adminErr.message);
  if (editErr) throw new Error(editErr.message);
  if (!isAdmin && !canEdit) throw new Error("You don't have permission to edit students here");
}

/* ------------------------------------------------------------------------- */
/* Error mapping                                                              */
/* ------------------------------------------------------------------------- */

export type StudentAdmitErrorKind =
  "DUPLICATE_IDENTITY" | "DUPLICATE_ADMISSION" | "BED_UNAVAILABLE" | "FAILED";

export class StudentAdmitError extends Error {
  readonly kind: StudentAdmitErrorKind;
  constructor(kind: StudentAdmitErrorKind, message: string) {
    super(message);
    this.name = "StudentAdmitError";
    this.kind = kind;
  }
}

export const ADMISSION_TAKEN_MESSAGE = "Admission ID already used in this property";
const ADMISSION_INDEX = "uniq_students_property_admission_active";

type DbError = { message: string; code?: string };

const RLS_ACTION_BY_TABLE: Record<string, string> = {
  students: "add or edit students",
  guardians: "add or edit guardians",
  student_guardians: "add or edit guardians",
  allocations: "assign beds",
  agreements: "assign beds",
  invoices: "issue invoices",
  payments: "record payments",
};

/** Postgres / PostgREST error -> a kind + a message safe to show in a toast or an import row. */
export function classifyStudentDbError(e: DbError): StudentAdmitError {
  const msg = e.message ?? "";
  if (e.code === "23505") {
    // The identity guard trigger (fn_students_identity_unique_guard) words its own message.
    if (/already registered/i.test(msg)) return new StudentAdmitError("DUPLICATE_IDENTITY", msg);
    if (msg.includes(ADMISSION_INDEX)) {
      return new StudentAdmitError("DUPLICATE_ADMISSION", ADMISSION_TAKEN_MESSAGE);
    }
    if (msg.includes("uidx_allocations_active_bed")) {
      return new StudentAdmitError(
        "BED_UNAVAILABLE",
        "That bed was just taken by someone else. Choose another bed.",
      );
    }
    if (msg.includes("uniq_invoices_property_number")) {
      return new StudentAdmitError(
        "FAILED",
        "Another invoice was being numbered at the same moment. Please try again.",
      );
    }
  }
  // fn_guard_allocation_bed (55000) rejects BLOCKED / MAINTENANCE beds; fn_admit_student raises
  // "Bed <code> in room <n> is not vacant" for anything else that isn't VACANT.
  if (e.code === "55000" || /not vacant/i.test(msg)) {
    return new StudentAdmitError("BED_UNAVAILABLE", msg || "That bed is not available");
  }
  if (e.code === "42501" || /row-level security/i.test(msg)) {
    const table = /for table "([a-z_]+)"/i.exec(msg)?.[1] ?? "";
    const action = RLS_ACTION_BY_TABLE[table];
    return new StudentAdmitError(
      "FAILED",
      action
        ? `You don't have permission to ${action} in this property`
        : msg || "You don't have permission to do this",
    );
  }
  return new StudentAdmitError("FAILED", msg || "Something went wrong. Please try again.");
}

function isGeneratedAdmissionClash(e: DbError): boolean {
  return e.code === "23505" && (e.message ?? "").includes(ADMISSION_INDEX);
}

/* ------------------------------------------------------------------------- */
/* Audit + receipt (best effort, never throw)                                 */
/* ------------------------------------------------------------------------- */

export type StudentAuditRow = Database["public"]["Tables"]["audit_logs"]["Insert"];

/** audit_logs has no client INSERT policy: service role only (same as writeFinanceAudit). */
export async function writeStudentAudit(rows: StudentAuditRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from("audit_logs").insert(rows.slice(i, i + 200));
      if (error) console.warn("[students] audit_logs insert failed", error.message);
    }
  } catch (e) {
    console.warn("[students] audit_logs insert failed", e);
  }
}

export const RECEIPT_WARNING =
  "The payment was recorded, but its receipt could not be generated yet.";

/** Returns a warning for the UI when the generate-receipt Edge Function fails. */
export async function generateReceiptBestEffort(
  supabase: Client,
  paymentId: string,
): Promise<string | undefined> {
  try {
    const { error } = await supabase.functions.invoke("generate-receipt", {
      body: { payment_id: paymentId },
    });
    if (error) throw error;
    return undefined;
  } catch (e) {
    console.warn("[students] receipt generation failed", e);
    return RECEIPT_WARNING;
  }
}

/** Audit rows for an opening-dues invoice and the offline payment recorded with it. */
export function chargeAuditRows(args: {
  tenantId: string;
  propertyId: string;
  userId: string;
  studentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountPaise: number;
  dueDate: string | null;
  note: string | null;
  payment: {
    id: string;
    number: string | null;
    amountPaise: number;
    mode: string;
    reference: string | null;
  } | null;
}): StudentAuditRow[] {
  const rows: StudentAuditRow[] = [
    {
      tenant_id: args.tenantId,
      property_id: args.propertyId,
      actor_user_id: args.userId,
      action: "OPENING_DUES_INVOICE_ISSUED",
      entity_type: "invoices",
      entity_id: args.invoiceId,
      after_data: {
        student_id: args.studentId,
        invoice_number: args.invoiceNumber,
        amount_paise: args.amountPaise,
        due_date: args.dueDate,
        note: args.note,
      },
    },
  ];
  if (args.payment) {
    rows.push({
      tenant_id: args.tenantId,
      property_id: args.propertyId,
      actor_user_id: args.userId,
      action: "MANUAL_PAYMENT_RECORDED",
      entity_type: "payments",
      entity_id: args.payment.id,
      after_data: {
        invoice_id: args.invoiceId,
        amount_paise: args.payment.amountPaise,
        mode: args.payment.mode,
        payment_number: args.payment.number,
        offline_reference: args.payment.reference,
      },
    });
  }
  return rows;
}

/* ------------------------------------------------------------------------- */
/* Admission                                                                  */
/* ------------------------------------------------------------------------- */

const nullableText = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

const admitRpcResultSchema = z.object({
  student_id: z.string().uuid(),
  admission_number: z.string(),
  allocation_id: nullableText,
  invoice_id: nullableText,
  invoice_number: nullableText,
  payment_id: nullableText,
  payment_number: nullableText,
});

export const chargeRpcResultSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: nullableText,
  payment_id: nullableText,
  payment_number: nullableText,
});

export interface AdmitResult {
  student_id: string;
  admission_number: string;
  allocation_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  payment_id: string | null;
  payment_number: string | null;
  receiptWarning?: string;
}

export interface AdmitOptions {
  /** Recorded on the STUDENT_ADMITTED audit row. */
  source?: "MANUAL" | "BULK_IMPORT";
  /** When given, audit rows are appended here for the caller to write in one batch. */
  auditSink?: StudentAuditRow[];
  /** Property-local "YYYY-MM-DD" used for is_minor; defaults to today in Asia/Kolkata. */
  today?: string;
}

const MAX_GENERATED_ATTEMPTS = 3;

const blankToNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Admits one student in ONE database transaction (fn_admit_student): student + primary guardian,
 * optional bed (allocation PENDING_AGREEMENT + agreement SENT), optional opening-dues invoice and
 * optional offline payment. Nothing is left behind when any step fails. Then, best effort: the
 * payment receipt and the audit trail.
 */
export async function admitStudentRow(
  supabase: Client,
  userId: string,
  input: AdmitStudentInput & { admission_number?: string },
  options: AdmitOptions = {},
): Promise<AdmitResult> {
  const customAdmission = (input.admission_number ?? "").trim().toUpperCase();
  const dob = blankToNull(input.date_of_birth);
  const guardianPhone = blankToNull(input.guardian_phone);
  const studentPhone = blankToNull(input.phone);
  const { placement, charge } = input;
  const payment = charge?.payment;

  const args: Record<string, unknown> = {
    p_tenant_id: input.tenant_id,
    p_property_id: input.property_id,
    p_full_name: input.full_name.trim(),
    p_phone: studentPhone ? normalizeIndianPhone(studentPhone) : null,
    p_email: blankToNull(input.email),
    p_date_of_birth: dob,
    p_gender: blankToNull(input.gender),
    p_academic_institute: blankToNull(input.academic_institute),
    p_course_name: blankToNull(input.course_name),
    p_academic_year: blankToNull(input.academic_year),
    p_is_minor: isMinorOn(dob, options.today ?? todayInTimezone()),
    p_guardian_name: blankToNull(input.guardian_name),
    p_guardian_phone: guardianPhone ? normalizeIndianPhone(guardianPhone) : null,
    p_guardian_relationship: blankToNull(input.guardian_relationship),
    p_guardian_email: blankToNull(input.guardian_email),
    p_initial_status: input.initial_status,
    p_bed_id: placement?.bed_id ?? null,
    p_fee_plan_id: placement?.fee_plan_id ?? null,
    p_start_date: placement?.start_date ?? null,
    p_rent_paise: placement?.rent_snapshot_paise ?? null,
    p_deposit_paise: placement?.deposit_snapshot_paise ?? null,
    p_opening_dues_paise: charge?.amount_paise ?? null,
    p_dues_due_date: charge?.due_date ?? null,
    p_dues_note: blankToNull(charge?.note),
    p_payment_amount_paise: payment?.amount_paise ?? null,
    p_payment_mode: payment?.mode ?? null,
    p_payment_reference: blankToNull(payment?.reference),
    p_cheque_date: blankToNull(payment?.cheque_date),
  };

  let raw: unknown = null;
  for (let attempt = 1; ; attempt += 1) {
    const admissionNumber = customAdmission || nextAdmissionNumber();
    const { data, error } = await callRpc(supabase, "fn_admit_student", {
      ...args,
      p_admission_number: admissionNumber,
    });
    if (!error) {
      raw = data;
      break;
    }
    // Only a generated ID is retried; a typed one is the admin's to change.
    if (!customAdmission && isGeneratedAdmissionClash(error) && attempt < MAX_GENERATED_ATTEMPTS) {
      continue;
    }
    throw classifyStudentDbError(error);
  }

  const parsed = admitRpcResultSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[admitStudentRow] unexpected fn_admit_student result", raw);
    throw new StudentAdmitError(
      "FAILED",
      "The student was saved, but the response could not be read. Refresh to see them.",
    );
  }
  const result: AdmitResult = parsed.data;

  if (result.payment_id) {
    result.receiptWarning = await generateReceiptBestEffort(supabase, result.payment_id);
  }

  const audit: StudentAuditRow[] = [
    {
      tenant_id: input.tenant_id,
      property_id: input.property_id,
      actor_user_id: userId,
      action: "STUDENT_ADMITTED",
      entity_type: "students",
      entity_id: result.student_id,
      after_data: {
        source: options.source ?? "MANUAL",
        admission_number: result.admission_number,
        admission_number_generated: !customAdmission,
        full_name: input.full_name.trim(),
        initial_status: input.initial_status,
        allocation_id: result.allocation_id,
        bed_id: placement?.bed_id ?? null,
        fee_plan_id: placement?.fee_plan_id ?? null,
      },
    },
  ];
  if (result.invoice_id && charge) {
    audit.push(
      ...chargeAuditRows({
        tenantId: input.tenant_id,
        propertyId: input.property_id,
        userId,
        studentId: result.student_id,
        invoiceId: result.invoice_id,
        invoiceNumber: result.invoice_number,
        amountPaise: charge.amount_paise,
        dueDate: charge.due_date,
        note: blankToNull(charge.note),
        payment:
          result.payment_id && payment
            ? {
                id: result.payment_id,
                number: result.payment_number,
                amountPaise: payment.amount_paise,
                mode: payment.mode,
                reference: blankToNull(payment.reference),
              }
            : null,
      }),
    );
  }
  if (options.auditSink) options.auditSink.push(...audit);
  else await writeStudentAudit(audit);

  return result;
}
