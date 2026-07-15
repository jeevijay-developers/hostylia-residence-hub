import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * After a phone-OTP verify, backfill `guardians.profile_id` for any guardian
 * rows whose `phone` matches the authenticated user's phone and that don't
 * yet have a linked profile. Idempotent — safe to call on every login.
 *
 * We match on phone because guardian records are created by admins before
 * the parent ever signs in. Uses supabaseAdmin because guardians rows are
 * not readable by the parent until their profile_id is set (chicken-and-egg).
 */
export const linkGuardianProfileOnLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (uErr || !userRes.user) return { linked: 0 };

    const raw = userRes.user.phone;
    if (!raw) return { linked: 0 };
    const normalized = raw.startsWith("+") ? raw : `+${raw}`;

    const { data: rows, error: gErr } = await supabaseAdmin
      .from("guardians")
      .update({ profile_id: userId })
      .eq("phone", normalized)
      .is("profile_id", null)
      .is("deleted_at", null)
      .select("id");
    if (gErr) throw new Error(gErr.message);

    return { linked: rows?.length ?? 0 };
  });
