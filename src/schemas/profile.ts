import { z } from "zod";

import { emailSchema, fullNameSchema, phoneSchema } from "@/schemas/auth";

/**
 * Self-service profile update — the account owner editing their own
 * `profiles` row (name/phone). Reused by the account edit dialog's form and
 * its Supabase update call.
 */
export const profileUpdateSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema.optional().or(z.literal("")),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);

export const bloodGroupSchema = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export const addressSchema = z.object({
  line1: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  pincode: z.string().trim().max(12).optional().or(z.literal("")),
});

/**
 * Warden self-service "Edit Profile" — covers only the fields the spec
 * allows a Warden to edit on their own `profiles` row. Employee ID, role,
 * assigned property/block, joining date, account status and permissions are
 * intentionally absent (never rendered as editable, let alone validated
 * here).
 */
export const wardenProfileEditSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema,
  emergencyContactName: z.string().trim().min(2, "Enter an emergency contact name").max(120),
  emergencyContactNumber: phoneSchema,
  alternatePhone: phoneSchema.optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  address: addressSchema.optional(),
});

export type WardenProfileEditInput = z.infer<typeof wardenProfileEditSchema>;

/**
 * Accountant self-service "Edit Profile" — deliberately minimal (finance/
 * staff account, not a full HR profile). Email is intentionally absent:
 * it's tied to auth and rendered read-only, never submitted here. Role,
 * tenant, property assignment and permissions are never editable.
 */
export const accountantProfileEditSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
});

export type AccountantProfileEditInput = z.infer<typeof accountantProfileEditSchema>;
