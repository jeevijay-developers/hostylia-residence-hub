import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const OTP_LIMIT = 5;
const OTP_WINDOW_SECONDS = 600; // 10 minutes

const sendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number (E.164 expected)"),
});

/**
 * Rate-limited phone OTP send.
 * Bucket key: `otp:<phone>` — max 5 sends per 10 minutes.
 */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((data) => sendOtpSchema.parse(data))
  .handler(async ({ data }) => {
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

    const { data: allowed, error: rlErr } = await supabase.rpc("check_rate_limit", {
      p_bucket_key: `otp:${data.phone}`,
      p_limit: OTP_LIMIT,
      p_window_seconds: OTP_WINDOW_SECONDS,
    });

    if (rlErr) {
      throw new Error(`Rate limit check failed: ${rlErr.message}`);
    }
    if (!allowed) {
      throw new Error("Too many OTP requests. Please wait a few minutes and try again.");
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: data.phone,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true as const };
  });
