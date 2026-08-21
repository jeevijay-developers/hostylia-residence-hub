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

export const indianPhoneSchema = phoneSchema;

/**
 * Strict Indian mobile check (exactly 10 digits, optional +91/91 prefix,
 * first digit 6-9) — for fields specifically presented as an Indian mobile
 * number (signup/login phone, guardian phone). The general `phoneSchema`
 * above accepts 8-15 digit international-looking numbers, which was letting
 * through obviously-wrong values (e.g. a 13-digit string, or one with
 * stray letters slipping past a loose regex) without blocking the form.
 * This is the one used across every authentication phone field in the app.
 */
export const indianMobileSchema = z
  .string()
  .trim()
  .regex(/^(?:\+?91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

/**
 * Sanitizes phone input as the user types — used as an `onChange` filter so
 * invalid characters (letters, symbols, extra digits) never make it into
 * the field in the first place, instead of only rejecting on submit.
 * Keeps a leading "+" if the user typed one (matches the "+91 98765 43210"
 * placeholder shown on these fields) and caps length to a full +91 number
 * (12 digits after the +) or a bare 10-digit number otherwise.
 */
export function sanitizePhoneKeystroke(input: string): string {
  const hasPlus = input.trimStart().startsWith("+");
  const digits = input.replace(/\D/g, "");
  return hasPlus ? `+${digits.slice(0, 12)}` : digits.slice(0, 10);
}

export function sanitizeIndianPhoneInput(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

/**
 * Normalizes to E.164 with the +91 (India) country code — this app targets
 * Indian hostels, and Supabase Auth's phone-based auth matches on the exact
 * stored string. Storing a bare 10-digit number at invite/admission time
 * while login expects "+91…" silently creates two different identities for
 * the same person, so every write path that ends up as an auth.users.phone
 * or a guardians/profiles lookup key must go through this first.
 */
export function normalizeIndianPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

/**
 * Inverse of the above, for display only — stored/sent values must stay
 * E.164 (normalizeIndianPhone), this just hides the +91/91 country code
 * so admins see the 10-digit number they'd actually recognize.
 */
export function displayIndianPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+91") && trimmed.length === 13) return trimmed.slice(3);
  if (trimmed.startsWith("91") && trimmed.length === 12) return trimmed.slice(2);
  return trimmed;
}

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
  .max(80, "Name is too long")
  .regex(/^\p{L}[\p{L}\s.'-]*$/u, "Name can only contain letters, spaces, and . ' -");

export const hostelNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your hostel / property name")
  .max(120, "Name is too long");

export const phoneLoginSchema = z.object({
  phone: indianMobileSchema,
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
  .refine((d) => d.role !== "STUDENT" || indianMobileSchema.safeParse(d.guardianPhone).success, {
    message: "Enter a valid 10-digit Indian mobile number",
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
  phone: indianMobileSchema,
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
