import { z } from "zod";

/**
 * Shared auth validation schemas.
 * Used by both client-side forms (LoginForm) and server-side handlers.
 */

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number in international format (e.g. +919876543210)");

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(255, "Email is too long");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const phoneLoginSchema = z.object({
  phone: phoneSchema,
});

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  token: otpCodeSchema,
});

export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

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
