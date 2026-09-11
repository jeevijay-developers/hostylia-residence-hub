import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIndianPhone, phoneNumbersMatch } from "@/schemas/auth";

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
    if (uErr || !userRes.user?.phone) return { linked: 0 };

    const authPhone = normalizeIndianPhone(userRes.user.phone);
    const { data: candidates, error: listErr } = await supabaseAdmin
      .from("guardians")
      .select("id, phone")
      .is("profile_id", null)
      .is("deleted_at", null);
    if (listErr) throw new Error(listErr.message);

    const matches = (candidates ?? []).filter((row) => phoneNumbersMatch(authPhone, row.phone ?? ""));
    for (const row of matches) {
      const { error } = await supabaseAdmin
        .from("guardians")
        .update({ profile_id: userId, portal_access_enabled: true })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    return { linked: matches.length };
  });
