import { z } from "zod";

import { fullNameSchema, phoneSchema } from "@/schemas/auth";

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
