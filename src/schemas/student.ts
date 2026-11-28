import { z } from "zod";
import { phoneSchema as authPhoneSchema, emailSchema, indianMobileField } from "@/schemas/auth";
import { addressSchema, bloodGroupSchema } from "@/schemas/profile";

const phoneSchema = authPhoneSchema;

export const studentStatusEnum = z.enum([
  "APPLICANT",
  "VERIFIED",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVED_OUT",
  "ARCHIVED",
  "REJECTED",
]);

export const allocationStatusEnum = z.enum([
  "DRAFT",
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
  "CLOSED",
  "CANCELLED",
]);

// Both phone fields are Indian mobiles and are normalized to "+91XXXXXXXXXX" — the
// same rule runs in the form (field-by-field) and in submitPublicAdmission.
export const publicAdmissionSchema = z.object({
  property_slug: z.string().trim().min(2).max(80),
  full_name: z
    .string()
    .trim()
    .min(2, "Enter the student's full name (at least 2 characters)")
    .max(120, "Name can be at most 120 characters"),
  phone: indianMobileField("Student phone number is required"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(255, "Email can be at most 255 characters")
    .optional()
    .or(z.literal("")),
  date_of_birth: z.string().date("Enter a valid date of birth").optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  academic_institute: z
    .string()
    .trim()
    .max(160, "Institute can be at most 160 characters")
    .optional()
    .or(z.literal("")),
  course_name: z
    .string()
    .trim()
    .max(160, "Course can be at most 160 characters")
    .optional()
    .or(z.literal("")),
  academic_year: z
    .string()
    .trim()
    .max(40, "Academic year can be at most 40 characters")
    .optional()
    .or(z.literal("")),
  guardian_name: z
    .string()
    .trim()
    .min(2, "Enter the guardian's name (at least 2 characters)")
    .max(120, "Name can be at most 120 characters"),
  guardian_phone: indianMobileField("Guardian phone number is required"),
  guardian_relationship: z
    .string()
    .trim()
    .min(2, "Enter the relationship (e.g. Parent, Guardian)")
    .max(60, "Relationship can be at most 60 characters"),
  turnstileToken: z.string().trim().min(1).max(2048),
  // Set only by the public /apply form. Marks the application as eligible for
  // automatic account linking after a verified signup (see fn_link_public_applicant);
  // the signup-wizard path omits it and keeps its existing manual-confirm flow.
  origin: z.literal("apply_form").optional(),
});
export type PublicAdmissionInput = z.infer<typeof publicAdmissionSchema>;

export const studentBulkRowSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.string().trim().max(20).optional().or(z.literal("")),
  academic_institute: z.string().trim().max(160).optional().or(z.literal("")),
  course_name: z.string().trim().max(160).optional().or(z.literal("")),
  guardian_name: z.string().trim().max(120).optional().or(z.literal("")),
  guardian_phone: z.string().trim().optional().or(z.literal("")),
});
export type StudentBulkRow = z.infer<typeof studentBulkRowSchema>;

/** Manual "Add student" (admin/warden): unlike bulk CSV import, a guardian
 * contact is always known at the point of entry, so it's required here. */
export const manualStudentRowSchema = studentBulkRowSchema.extend({
  guardian_name: z.string().trim().min(2).max(120),
  guardian_phone: phoneSchema,
});
export type ManualStudentRow = z.infer<typeof manualStudentRowSchema>;

export const allocationCreateSchema = z.object({
  student_id: z.string().uuid(),
  bed_id: z.string().uuid(),
  // Without this, neither the recurring monthly generator nor the
  // agreement-signing invoice (PRD 8.2.4) can ever bill the allocation —
  // both join through fee_plan_id and silently no-op without it.
  fee_plan_id: z.string().uuid(),
  start_date: z.string().date(),
  expected_end_date: z.string().date().optional().or(z.literal("")),
  rent_snapshot_paise: z.number().int().min(0),
  deposit_snapshot_paise: z.number().int().min(0).default(0),
  billing_cycle_day: z.number().int().min(1).max(28).default(1),
  lock_in_until: z.string().date().optional().or(z.literal("")),
  notice_period_days: z.number().int().min(0).default(30),
});

// PRD 6.2.3 one-tap bed swap — moves a student's existing open allocation to
// a different vacant bed without closing/recreating it (see
// swap_allocation_bed in the DB, RULES.md 19.3).
export const swapAllocationBedSchema = z.object({
  allocation_id: z.string().uuid(),
  new_bed_id: z.string().uuid(),
});

export const clickConsentSchema = z.object({
  agreement_id: z.string().uuid(),
  document_hash: z.string().min(8).max(200),
});

export const MIN_STUDENT_AGE_YEARS = 10;
export const MAX_STUDENT_AGE_YEARS = 100;

/** Student self-service profile edit (student.profile.tsx). The `students`
 * self-update RLS policy + guard trigger already let a student touch these
 * columns freely at the DB level — this is the only place format/sanity is
 * enforced, so a bad phone/email/DOB was previously saved as-is. */
/** Student self-service profile edit (student.profile.tsx). Validates fields
 * that are split across the `students` and `profiles` tables. */
export const studentSelfProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  date_of_birth: z
    .string()
    .date()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => {
        if (!v) return true;
        const dob = new Date(v);
        if (Number.isNaN(dob.getTime()) || dob > new Date()) return false;
        const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        return ageYears >= MIN_STUDENT_AGE_YEARS && ageYears <= MAX_STUDENT_AGE_YEARS;
      },
      { message: "Enter a valid date of birth" },
    ),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().or(z.literal("")),
  academic_institute: z.string().trim().max(160).optional().or(z.literal("")),
  course_name: z.string().trim().max(160).optional().or(z.literal("")),
  academic_year: z.string().trim().max(40).optional().or(z.literal("")),
  blood_group: bloodGroupSchema.optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  emergency_contact_number: phoneSchema.optional().or(z.literal("")),
  address: addressSchema.optional(),
});
export type StudentSelfProfileInput = z.infer<typeof studentSelfProfileSchema>;

/** Staff-side edit of a student's personal/academic fields (Hostel Admin VCED,
 * Warden VE assigned-block per PRD 7 "Student profiles" row). Same field set
 * and validation as the student's own self-edit — just targeted at a
 * `student_id` instead of the caller's own linked record. Guardian records,
 * KYC, allocation, status and finance fields are out of scope here — those
 * have their own dedicated flows. */
export const studentStaffProfileEditSchema = studentSelfProfileSchema.extend({
  student_id: z.string().uuid(),
});
export type StudentStaffProfileEditInput = z.infer<typeof studentStaffProfileEditSchema>;

/**
 * KYC upload rules. The hard limits live in the `kyc-documents` bucket
 * (private, file_size_limit 5 MB, allowed_mime_types jpeg/png/webp/pdf — see
 * 20261023093212_force_rls_private_avatars_and_vault_header.sql); the per-type
 * narrowing below is enforced client-side, in `registerDocument`, and by the
 * `fn_validate_kyc_document` insert trigger (20261029120000). Keep all four in
 * sync. A matching extension/MIME/size only proves the file is a plausible
 * image/PDF — authenticity is still decided by the Admin/Warden review.
 */
export const kycDocumentTypeEnum = z.enum(["AADHAAR", "COLLEGE_ID", "PHOTO", "OTHER"]);
export type KycDocumentType = z.infer<typeof kycDocumentTypeEnum>;

export const KYC_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const KYC_MAX_FILE_LABEL = "5 MB";

const KYC_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export const KYC_DOCUMENT_RULES: Record<
  KycDocumentType,
  { extensions: readonly string[]; mimeTypes: readonly string[]; label: string }
> = {
  AADHAAR: {
    extensions: ["jpg", "jpeg", "png", "pdf"],
    mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    label: "JPG, PNG or PDF",
  },
  COLLEGE_ID: {
    extensions: ["jpg", "jpeg", "png", "pdf"],
    mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    label: "JPG, PNG or PDF",
  },
  PHOTO: {
    extensions: ["jpg", "jpeg", "png"],
    mimeTypes: ["image/jpeg", "image/png"],
    label: "JPG or PNG",
  },
  // Flexible: whatever the bucket's own policy accepts.
  OTHER: {
    extensions: ["jpg", "jpeg", "png", "webp", "pdf"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    label: "JPG, PNG, WebP or PDF",
  },
};

/** "JPG, PNG or PDF" for a valid type; the bucket-wide list otherwise. */
export function kycFormatsLabel(documentType: string): string {
  const parsed = kycDocumentTypeEnum.safeParse(documentType);
  return KYC_DOCUMENT_RULES[parsed.success ? parsed.data : "OTHER"].label;
}

function kycFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Some browsers/OS pickers report an empty `File.type`; fall back to the extension. */
export function resolveKycMimeType(fileName: string, reportedType: string): string {
  if (reportedType) return reportedType.toLowerCase();
  return KYC_MIME_BY_EXTENSION[kycFileExtension(fileName)] ?? "";
}

/**
 * Returns a user-facing error, or null when the document type and file are
 * acceptable. Checks the type enum, then extension, MIME type, that the two
 * agree, and size. Used by the upload form and by `registerDocument`.
 */
export function validateKycFile(
  file: { name: string; type: string; size: number },
  documentType: string,
): string | null {
  const parsed = kycDocumentTypeEnum.safeParse(documentType);
  if (!parsed.success) {
    return `Invalid document type. Choose one of: ${kycDocumentTypeEnum.options.join(", ")}.`;
  }
  const rule = KYC_DOCUMENT_RULES[parsed.data];
  const allowed = `Allowed formats for ${parsed.data.replace(/_/g, " ")}: ${rule.label}, up to ${KYC_MAX_FILE_LABEL}.`;

  const ext = kycFileExtension(file.name);
  const mime = resolveKycMimeType(file.name, file.type);
  if (!rule.extensions.includes(ext)) {
    return `"${file.name}" has an unsupported file extension. ${allowed}`;
  }
  if (!rule.mimeTypes.includes(mime)) {
    return `This file's format (${mime || "unknown"}) is not allowed. ${allowed}`;
  }
  if (KYC_MIME_BY_EXTENSION[ext] !== mime) {
    return `The file extension (.${ext}) does not match its format (${mime}). ${allowed}`;
  }
  if (file.size <= 0) return "This file is empty.";
  if (file.size > KYC_MAX_FILE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${KYC_MAX_FILE_LABEL}. ${allowed}`;
  }
  return null;
}

export const giveNoticeSchema = z.object({
  allocation_id: z.string().uuid(),
  requested_move_out_date: z.string().date(),
  reason: z.string().trim().min(3, "Please tell us why you are leaving").max(500),
  remarks: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type GiveNoticeInput = z.infer<typeof giveNoticeSchema>;

// Shape returned by the move_out_settlement RPC (invoice-wise dues vs. the
// real deposit ledger balance). Parsed at the trust boundary instead of cast.
export const moveOutSettlementSchema = z.object({
  allocation_id: z.string().uuid(),
  deposit_balance_paise: z.number(),
  total_dues_paise: z.number(),
  planned_deduction_paise: z.number(),
  shortfall_paise: z.number(),
  refund_in_flight_paise: z.number(),
  refundable_paise: z.number(),
  invoices: z.array(
    z.object({
      id: z.string().uuid(),
      invoice_number: z.string(),
      due_date: z.string(),
      status: z.string(),
      balance_paise: z.number(),
      deduct_paise: z.number(),
    }),
  ),
});
export type MoveOutSettlement = z.infer<typeof moveOutSettlementSchema>;

/**
 * Identity keys for duplicate-student detection. They MUST mirror the database
 * (public.normalize_phone and lower(btrim(email)) in the student guard trigger):
 * phone = digits only, last 10 when there are at least 10; email = trimmed,
 * lower-cased. Blank / digit-less values have no key and are never compared.
 */
export function studentPhoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits === "") return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
export function studentEmailKey(email: string | null | undefined): string | null {
  const key = (email ?? "").trim().toLowerCase();
  return key === "" ? null : key;
}

/* ------------------------------------------------------------------------- */
/* Property Students tab: Add / Edit student, placement, opening dues and     */
/* offline payment, review-status changes. One shape shared by the client     */
/* form, the server functions and (field-for-field) the bulk CSV import.      */
/* ------------------------------------------------------------------------- */

/** Offline payment methods staff can record (record_manual_payment / payments.mode). */
export const OFFLINE_PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"] as const;
export const offlinePaymentModeEnum = z.enum(OFFLINE_PAYMENT_MODES);
export type OfflinePaymentMode = z.infer<typeof offlinePaymentModeEnum>;
/** Modes where a transaction / UTR / cheque number must be captured. */
export const PAYMENT_MODES_NEEDING_REFERENCE: readonly OfflinePaymentMode[] = [
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
];

/** Largest single amount accepted anywhere in these flows: ₹1 crore, in paise. */
export const MAX_STUDENT_AMOUNT_PAISE = 1_000_000_000;

/** Statuses an admin may set directly; everything else follows the stay lifecycle. */
export const STUDENT_INITIAL_STATUSES = ["APPLICANT", "VERIFIED"] as const;
export const studentInitialStatusEnum = z.enum(STUDENT_INITIAL_STATUSES);

/** Custom admission ID; blank means "generate one". Unique per property (DB index). */
export const admissionNumberField = z
  .string()
  .trim()
  .max(40, "Admission ID can be at most 40 characters")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9\-/_.]*$/,
    "Use letters, digits and - / _ . only, starting with a letter or digit",
  )
  .optional()
  .or(z.literal(""));

/** Rupee amount typed as text (form inputs, CSV cells): up to 2 decimals. */
export const rupeesTextField = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 4500 or 4500.50")
  .optional()
  .or(z.literal(""));

/** "4500.5" -> 450050 paise without float error; "" / undefined -> 0. */
export function rupeesTextToPaise(value: string | null | undefined): number {
  const v = (value ?? "").trim();
  if (!v) return 0;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** Student + primary guardian details, identical for Add and Edit. */
export const studentDetailsSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter the student's full name (at least 2 characters)")
    .max(120, "Name can be at most 120 characters"),
  admission_number: admissionNumberField,
  phone: phoneSchema.optional().or(z.literal("")),
  email: emailSchema.optional().or(z.literal("")),
  date_of_birth: z.string().date("Enter a valid date of birth").optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().or(z.literal("")),
  academic_institute: optionalText(160),
  course_name: optionalText(160),
  academic_year: optionalText(40),
  guardian_name: z
    .string()
    .trim()
    .min(2, "Enter the guardian's name (at least 2 characters)")
    .max(120, "Name can be at most 120 characters"),
  guardian_phone: phoneSchema,
  guardian_relationship: z
    .string()
    .trim()
    .min(2, "Enter the relationship (e.g. Father, Mother, Guardian)")
    .max(60, "Relationship can be at most 60 characters"),
  guardian_email: emailSchema.optional().or(z.literal("")),
});
export type StudentDetailsInput = z.infer<typeof studentDetailsSchema>;

/** Optional bed assignment at admission -> allocation in PENDING_AGREEMENT. */
export const studentPlacementSchema = z.object({
  bed_id: z.string().uuid(),
  fee_plan_id: z.string().uuid({ message: "Choose a fee plan" }),
  start_date: z.string().date("Choose the move-in date"),
  rent_snapshot_paise: z.number().int().min(0).max(MAX_STUDENT_AMOUNT_PAISE),
  deposit_snapshot_paise: z.number().int().min(0).max(MAX_STUDENT_AMOUNT_PAISE),
});
export type StudentPlacementInput = z.infer<typeof studentPlacementSchema>;

/** Offline payment captured against a charge in the same step. */
export const studentPaymentSchema = z
  .object({
    amount_paise: z
      .number()
      .int()
      .min(1, "Enter the amount received")
      .max(MAX_STUDENT_AMOUNT_PAISE),
    mode: offlinePaymentModeEnum,
    reference: z.string().trim().max(120).optional().or(z.literal("")),
    cheque_date: z.string().date().optional().or(z.literal("")),
  })
  .superRefine((p, ctx) => {
    if (PAYMENT_MODES_NEEDING_REFERENCE.includes(p.mode) && !p.reference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference"],
        message:
          p.mode === "CHEQUE" ? "Enter the cheque number" : "Enter the transaction / UTR reference",
      });
    }
    if (p.mode === "CHEQUE" && !p.cheque_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cheque_date"],
        message: "Enter the cheque date",
      });
    }
  });
export type StudentPaymentInput = z.infer<typeof studentPaymentSchema>;

/**
 * A one-off charge (opening dues: admission fee, back-dues, other) issued as its
 * own invoice, optionally paid offline right away. Rent and deposit are NOT
 * entered here: they bill automatically once the student signs the agreement.
 */
const studentChargeObject = z.object({
  amount_paise: z.number().int().min(1, "Enter the amount due").max(MAX_STUDENT_AMOUNT_PAISE),
  due_date: z.string().date("Choose a due date"),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  payment: studentPaymentSchema.optional(),
});
const chargePaymentWithinAmount = (
  c: { amount_paise: number; payment?: { amount_paise: number } },
  ctx: z.RefinementCtx,
) => {
  if (c.payment && c.payment.amount_paise > c.amount_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payment", "amount_paise"],
      message: "Amount received can't be more than the amount due",
    });
  }
};
export const studentChargeSchema = studentChargeObject.superRefine(chargePaymentWithinAmount);
export type StudentChargeInput = z.infer<typeof studentChargeSchema>;

/** Add student (Students tab modal). */
export const admitStudentSchema = studentDetailsSchema.extend({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  initial_status: studentInitialStatusEnum.default("APPLICANT"),
  placement: studentPlacementSchema.optional(),
  charge: studentChargeSchema.optional(),
});
export type AdmitStudentInput = z.infer<typeof admitStudentSchema>;

/** Edit student details + primary guardian (status/bed/money have their own actions). */
export const updateStudentDetailsSchema = studentDetailsSchema.extend({
  student_id: z.string().uuid(),
});
export type UpdateStudentDetailsInput = z.infer<typeof updateStudentDetailsSchema>;

/** Add a one-off charge (and optional payment) to an existing student. */
export const addStudentChargeSchema = studentChargeObject
  .extend({ student_id: z.string().uuid() })
  .superRefine(chargePaymentWithinAmount);
export type AddStudentChargeInput = z.infer<typeof addStudentChargeSchema>;

/** Review-status moves that don't involve a bed: verify, reject, restore. */
export const studentReviewStatusSchema = z
  .object({
    student_id: z.string().uuid(),
    status: z.enum(["APPLICANT", "VERIFIED", "REJECTED"]),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.status === "REJECTED" && (v.reason ?? "").length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Give a reason for rejecting",
      });
    }
  });
export type StudentReviewStatusInput = z.infer<typeof studentReviewStatusSchema>;

/** Staff records a move-out notice the student gave in person (same rules as give_notice). */
export const staffGiveNoticeSchema = giveNoticeSchema.extend({
  reason: z.string().trim().min(3, "Enter the reason the student gave").max(500),
});
export type StaffGiveNoticeInput = z.infer<typeof staffGiveNoticeSchema>;

const upperToken = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "_");

/**
 * Bulk CSV row: the same attributes as the Add student modal, as text cells.
 * Cross-field rules (room+bed together, payment needs dues, reference for
 * UPI/bank/cheque) are checked in classifyStudentRows so .extend() keeps working.
 */
export const studentImportRowSchema = studentBulkRowSchema.extend({
  admission_number: admissionNumberField,
  academic_year: optionalText(40),
  status: z
    .string()
    .transform(upperToken)
    .pipe(z.enum(["", "APPLICANT", "VERIFIED"]))
    .optional(),
  guardian_relationship: optionalText(60),
  guardian_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  room_number: optionalText(40),
  bed_code: optionalText(40),
  start_date: z.string().date().optional().or(z.literal("")),
  opening_dues_rupees: rupeesTextField,
  paid_rupees: rupeesTextField,
  payment_mode: z
    .string()
    .transform(upperToken)
    .pipe(z.enum(["", ...OFFLINE_PAYMENT_MODES]))
    .optional(),
  payment_reference: optionalText(120),
});
export type StudentImportRowInput = z.infer<typeof studentImportRowSchema>;
