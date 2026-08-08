import { z } from "zod";

/**
 * Shared auth validation schemas.
 * Used by both client-side forms (LoginForm) and server-side handlers.
 */

export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[1-9]\d{7,14}$/,
    "Enter a valid phone number in international format (e.g. +919876543210)",
  );

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(255, "Email is too long");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

export const otpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(80, "Name is too long");

export const hostelNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your hostel / property name")
  .max(120, "Name is too long");

export const phoneLoginSchema = z.object({
  phone: phoneSchema,
});

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Which kind of account is being created. Drives the signup steps shown and,
 * after first sign-in, whether `RoleRedirect` provisions a tenant
 * (HOSTEL_ADMIN) or routes to the "ask your hostel to link you" state
 * (STUDENT). Stored on the auth user as `signup_role` metadata.
 *
 * Only these two are self-serve. WARDEN/ACCOUNTANT arrive by staff invite,
 * PARENT by guardian linkage, SUPER_ADMIN by platform assignment.
 */
export const signupRoleSchema = z.enum(["HOSTEL_ADMIN", "STUDENT"]);
export type SignupRole = z.infer<typeof signupRoleSchema>;

/**
 * Step 2 — who you are. `hostelName` is required only for hostel owners;
 * `guardianName`/`guardianPhone` only for students (captured here so a
 * self-signed-up student's guardian record exists by the time an admin
 * confirms their admission, instead of relying on separate data entry).
 */
export const signupIdentitySchema = z
  .object({
    role: signupRoleSchema,
    fullName: fullNameSchema,
    hostelName: z.string().trim().max(120, "Name is too long").optional(),
    guardianName: z.string().trim().max(120, "Name is too long").optional(),
    guardianPhone: z.string().trim().optional(),
  })
  .refine((d) => d.role !== "HOSTEL_ADMIN" || (d.hostelName ?? "").trim().length >= 2, {
    message: "Enter your hostel / property name",
    path: ["hostelName"],
  })
  .refine((d) => d.role !== "STUDENT" || (d.guardianName ?? "").trim().length >= 2, {
    message: "Enter your parent/guardian's name",
    path: ["guardianName"],
  })
  .refine((d) => d.role !== "STUDENT" || phoneSchema.safeParse(d.guardianPhone).success, {
    message: "Enter a valid guardian phone number",
    path: ["guardianPhone"],
  });

/** Step 3a — email + password credentials. */
export const emailCredentialsSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Step 3b — phone (OTP) credentials. */
export const phoneCredentialsSchema = z.object({
  phone: phoneSchema,
});

export const emailSignupSchema = z
  .object({
    fullName: fullNameSchema,
    hostelName: hostelNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const phoneSignupSchema = z.object({
  fullName: fullNameSchema,
  hostelName: hostelNameSchema,
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  token: otpCodeSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Logged-in "Change Password" — current password is re-verified via
 * signInWithPassword before the new one is set (Supabase's updateUser alone
 * doesn't check the old password), so it's only required here, not shaped.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.password !== d.currentPassword, {
    message: "New password must be different from your current password",
    path: ["password"],
  });

export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type EmailSignupInput = z.infer<typeof emailSignupSchema>;
export type PhoneSignupInput = z.infer<typeof phoneSignupSchema>;
export type SignupIdentityInput = z.infer<typeof signupIdentitySchema>;
export type EmailCredentialsInput = z.infer<typeof emailCredentialsSchema>;
export type PhoneCredentialsInput = z.infer<typeof phoneCredentialsSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Rate-limit window used for OTP resend cooldown (seconds). */
export const OTP_RESEND_WINDOW_SECONDS = 600;
export const OTP_RESEND_LIMIT = 5;
/** Cooldown per resend button click (seconds) — shorter than the hard window. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Mask a phone number, keeping country prefix + last 2 digits. */
export function maskPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.length <= 4) return clean;
  const head = clean.slice(0, 3);
  const tail = clean.slice(-2);
  return `${head}${"•".repeat(Math.max(0, clean.length - 5))}${tail}`;
}
