import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone (E.164 expected)");

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
  start_date: z.string().date(),
  expected_end_date: z.string().date().optional().or(z.literal("")),
  rent_snapshot_paise: z.number().int().min(0),
  deposit_snapshot_paise: z.number().int().min(0).default(0),
  billing_cycle_day: z.number().int().min(1).max(28).default(1),
  lock_in_until: z.string().date().optional().or(z.literal("")),
  notice_period_days: z.number().int().min(0).default(30),
});

export const clickConsentSchema = z.object({
  agreement_id: z.string().uuid(),
  document_hash: z.string().min(8).max(200),
});
