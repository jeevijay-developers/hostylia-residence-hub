import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { indianMobileSchema, normalizeIndianPhone } from "@/schemas/auth";
import { isDevTestParentPhone } from "@/lib/dev-auth.functions";

const OTP_LIMIT = 5;
const OTP_WINDOW_SECONDS = 600; // 10 minutes

const sendOtpSchema = z.object({
  // Reuses the same strict Indian-mobile check the client validates
  // against, instead of a separately-maintained regex — belt-and-braces in
  // case this is ever called with an unvalidated value.
  phone: indianMobileSchema,
  // "signup" additionally checks the phone isn't already registered before
  // sending an OTP (so a duplicate signup attempt doesn't silently just log
  // the user into someone else's existing account), and forwards `metadata`
  // onto the new auth user the way SignupForm's direct signInWithOtp call
  // used to. "login" (default) keeps the exact prior behavior.
  intent: z.enum(["login", "signup"]).default("login"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Rate-limited phone OTP send.
 * Bucket key: `otp:<phone>` — max 5 sends per 10 minutes.
 */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((data) => sendOtpSchema.parse(data))
  .handler(async ({ data }) => {
    // Must match the exact string auth.users.phone was created with (see
    // inviteStaff) — otherwise a bare 10-digit number here silently becomes
    // a different identity than one stored as "+91…".
    const phone = normalizeIndianPhone(data.phone);

    // Local-testing-only Parent login bypass: the dev environment has no
    // real SMS provider wired up, so skip signInWithOtp entirely for the
    // designated test phone — the matching fixed OTP is accepted by
    // devParentTestLogin at verify time instead. No-ops outside dev (see
    // dev-auth.functions.ts for the env gate).
    if (isDevTestParentPhone(phone)) {
      return { ok: true as const, message: null };
    }

    if (data.intent === "signup") {
      const admin = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      // Stored phones aren't guaranteed to carry the leading "+" (same
      // ambiguity findUserByPhone in dev-auth.functions.ts defends against),
      // so match either form rather than risk a false "not registered".
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .in("phone", [phone, phone.replace(/^\+/, "")])
        .limit(1);
      if (existing && existing.length > 0) {
        return {
          ok: false as const,
          message: "This phone number is already registered. Please sign in instead.",
        };
      }
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Everything below is inside try/catch, not just the Supabase-returned
    // `{error}` tuples — if the dev server itself can't reach Supabase
    // (DNS/timeout/network), the client call throws instead of resolving
    // with an error, and an *uncaught* throw here is what was producing the
    // bare "Error: {}" on the client (TanStack Start's serializer doesn't
    // reliably carry a thrown Error's `.message` across the server-fn
    // boundary). Returning a structured result sidesteps that entirely.
    try {
      const { data: allowed, error: rlErr } = await supabase.rpc("check_rate_limit", {
        p_bucket_key: `otp:${phone}`,
        p_limit: OTP_LIMIT,
        p_window_seconds: OTP_WINDOW_SECONDS,
      });

      if (rlErr) {
        return { ok: false as const, message: `Rate limit check failed: ${rlErr.message}` };
      }
      if (!allowed) {
        return {
          ok: false as const,
          message: "Too many OTP requests. Please wait a few minutes and try again.",
        };
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options:
          data.intent === "signup" ? { shouldCreateUser: true, data: data.metadata } : undefined,
      });

      if (error) {
        return { ok: false as const, message: error.message };
      }

      return { ok: true as const, message: null };
    } catch (err) {
      console.error("sendPhoneOtp: unexpected failure reaching Supabase", err);
      const cause =
        err instanceof Error ? (err.cause as { message?: string } | undefined) : undefined;
      const detail = (err instanceof Error && err.message) || cause?.message || "unknown error";
      return {
        ok: false as const,
        message: `Could not reach the authentication service (${detail}). Check your connection and try again.`,
      };
    }
  });
