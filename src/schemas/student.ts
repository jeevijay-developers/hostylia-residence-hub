import { z } from "zod";
import { phoneSchema as authPhoneSchema, emailSchema } from "@/schemas/auth";
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

export const publicAdmissionSchema = z.object({
  property_slug: z.string().trim().min(2).max(80),
  full_name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  date_of_birth: z.string().date().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  academic_institute: z.string().trim().max(160).optional().or(z.literal("")),
  course_name: z.string().trim().max(160).optional().or(z.literal("")),
  academic_year: z.string().trim().max(40).optional().or(z.literal("")),
  guardian_name: z.string().trim().min(2).max(120),
  guardian_phone: phoneSchema,
  guardian_relationship: z.string().trim().min(2).max(60),
  turnstileToken: z.string().trim().min(1).max(2048),
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

const MIN_STUDENT_AGE_YEARS = 10;
const MAX_STUDENT_AGE_YEARS = 100;

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
