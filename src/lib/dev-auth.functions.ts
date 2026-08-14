import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Local-testing-only Parent login bypass.
 *
 * Lets a developer sign in as a designated test Parent account with a fixed
 * OTP instead of a real SMS round-trip. Disabled unless BOTH gates pass:
 *   - process.env.NODE_ENV !== "production" (false for `vite build`, the
 *     command used by both `bun run build` and `bun run build:dev` — only
 *     `vite dev`/`bun run dev` sets NODE_ENV=development)
 *   - DEV_TEST_LOGIN_ENABLED="true" is explicitly set, so it stays off by
 *     default even in a local dev server unless a developer opts in.
 * All matching env vars are server-only (not VITE_-prefixed), so none of
 * this — including the test phone/OTP/password — ever reaches the browser
 * bundle. The real sendPhoneOtp/verifyOtp flow used by actual users is
 * untouched; this is a separate, additive code path.
 *
 * Required env vars to use this locally:
 *   DEV_TEST_LOGIN_ENABLED=true
 *   DEV_TEST_PARENT_PHONE=+91XXXXXXXXXX   (E.164, reserved test number)
 *   DEV_TEST_PARENT_OTP=123456            (any fixed 6-digit code)
 *   DEV_TEST_PARENT_PASSWORD=<any local-only secret>
 */

function devTestLoginEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_TEST_LOGIN_ENABLED === "true";
}

/** Used by sendPhoneOtp to skip the real signInWithOtp call for the test phone. */
export function isDevTestParentPhone(phone: string): boolean {
  return (
    devTestLoginEnabled() &&
    !!process.env.DEV_TEST_PARENT_PHONE &&
    phone === process.env.DEV_TEST_PARENT_PHONE
  );
}

const bypassSchema = z.object({
  phone: z.string().trim(),
  otp: z.string().trim(),
});

async function findUserByPhone(admin: ReturnType<typeof createClient<Database>>, phone: string) {
  const bare = phone.replace(/^\+/, "");
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.phone === phone || u.phone === bare);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

export const devParentTestLogin = createServerFn({ method: "POST" })
  .validator((data) => bypassSchema.parse(data))
  .handler(async ({ data }) => {
    if (!devTestLoginEnabled()) {
      return { ok: false as const, message: "Test login is not available." };
    }
    const testPhone = process.env.DEV_TEST_PARENT_PHONE;
    const testOtp = process.env.DEV_TEST_PARENT_OTP;
    const testPassword = process.env.DEV_TEST_PARENT_PASSWORD;
    if (!testPhone || !testOtp || !testPassword) {
      return { ok: false as const, message: "Test login is not configured." };
    }
    if (data.phone !== testPhone || data.otp !== testOtp) {
      return { ok: false as const, message: "Test credentials did not match." };
    }

    const admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    try {
      let user = await findUserByPhone(admin, testPhone);
      if (!user) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          phone: testPhone,
          password: testPassword,
          phone_confirm: true,
          user_metadata: { full_name: "Dev Test Parent", dev_test_account: true },
        });
        if (createErr || !created.user) {
          return {
            ok: false as const,
            message: `Could not provision test account: ${createErr?.message ?? "unknown error"}`,
          };
        }
        user = created.user;
      } else {
        // Keep the account's password/confirmation in sync with the current
        // env values on every use, so rotating DEV_TEST_PARENT_PASSWORD
        // locally doesn't leave a stale credential behind.
        await admin.auth.admin.updateUserById(user.id, {
          password: testPassword,
          phone_confirm: true,
        });
      }

      const anon = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
      );
      const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
        phone: testPhone,
        password: testPassword,
      });
      if (signInErr || !signInData.session) {
        return { ok: false as const, message: signInErr?.message ?? "Test sign-in failed." };
      }

      return {
        ok: true as const,
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        },
      };
    } catch (err) {
      console.error("devParentTestLogin: unexpected failure", err);
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : "Test login failed unexpectedly.",
      };
    }
  });
