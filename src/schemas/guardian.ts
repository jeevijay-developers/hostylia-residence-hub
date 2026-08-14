import { z } from "zod";
import { emailSchema, fullNameSchema, phoneSchema } from "./auth";
import { addressSchema } from "./profile";

export const guardianPhoneUpdateSchema = z.object({
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
  phone: phoneSchema,
});

export type GuardianPhoneUpdateInput = z.infer<typeof guardianPhoneUpdateSchema>;

/**
 * Staff-side (Hostel Admin/Warden) full guardian edit — the richer surface
 * reached from a student's profile edit dialog, distinct from the
 * self-service `guardianSelfEditSchema` a parent uses on their own portal.
 * Unlike the self-edit path, staff are allowed to change `phone` here (same
 * authorization + audit trail as `guardianPhoneUpdateSchema`), since a
 * student's guardian contact details are staff-maintained data.
 */
export const guardianStaffEditSchema = z.object({
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  occupation: z.string().trim().max(120).optional().or(z.literal("")),
  address: addressSchema.optional(),
});

export type GuardianStaffEditInput = z.infer<typeof guardianStaffEditSchema>;

/**
 * Parent Portal "Edit Profile" — self-service update of a guardian's own
 * `guardians` row, scoped to PRD 5.2's Guardian/Parent field list (name,
 * phone, email, relation, portal access). `phone` is intentionally absent:
 * it's the SSO identity anchor useResolvedRole() matches against
 * auth.users.phone, so changing it is staff-only via
 * guardianPhoneUpdateSchema/updateGuardianPhone (audit logged). `relation`
 * lives on student_guardians (per-child), not this row, and `portal_access`
 * is staff-controlled. Both are mirrored by the DB guard trigger
 * (fn_guardians_guard_self_update) that rejects a self-edit touching
 * phone/tenant_id/profile_id/portal_access_enabled/status/deleted_at.
 */
export const guardianSelfEditSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema.optional().or(z.literal("")),
});

export type GuardianSelfEditInput = z.infer<typeof guardianSelfEditSchema>;
