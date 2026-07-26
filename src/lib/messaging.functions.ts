import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const openInput = z.object({ student_id: z.string().uuid() });

/**
 * Find-or-create an OPEN PARENT_WARDEN conversation for the given student.
 * - Caller must be a guardian of that student (via student_guardians -> guardians.profile_id).
 * - Adds caller as PARENT participant and every active WARDEN with a matching
 *   property/block scope from role_assignments.
 */
export const openParentWardenConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => openInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Load student + verify guardian linkage
    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, property_id, full_name")
      .eq("id", data.student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (sErr || !student) throw new Error("Student not found or not accessible");

    const { data: link, error: lErr } = await supabase
      .from("student_guardians")
      .select("id, guardians!inner(profile_id, deleted_at)")
      .eq("student_id", student.id)
      .is("unlinked_at", null)
      .eq("guardians.profile_id", userId)
      .is("guardians.deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (lErr || !link) throw new Error("You are not linked to this student");

    // 2. Find existing OPEN conversation via admin (RLS may not yet see it)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("tenant_id", student.tenant_id)
      .eq("property_id", student.property_id)
      .eq("student_id", student.id)
      .eq("conversation_type", "PARENT_WARDEN")
      .eq("status", "OPEN")
      .limit(1)
      .maybeSingle();

    let conversationId = existing?.id ?? null;

    if (!conversationId) {
      const { data: created, error: cErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          tenant_id: student.tenant_id,
          property_id: student.property_id,
          conversation_type: "PARENT_WARDEN",
          student_id: student.id,
          subject: `Chat about ${student.full_name}`,
          created_by: userId,
        })
        .select("id")
        .single();
      if (cErr || !created) throw new Error(cErr?.message ?? "Could not open conversation");
      conversationId = created.id;
    }

    // 3. Ensure caller (parent) is a participant
    await supabaseAdmin
      .from("conversation_participants")
      .upsert(
        {
          tenant_id: student.tenant_id,
          conversation_id: conversationId,
          user_id: userId,
          participant_role: "PARENT",
        },
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
      );

    // 4. Ensure at least one warden is a participant
    const { data: wardens } = await supabaseAdmin
      .from("role_assignments")
      .select("user_id")
      .eq("tenant_id", student.tenant_id)
      .eq("role", "WARDEN")
      .eq("is_active", true)
      .or(`property_id.is.null,property_id.eq.${student.property_id}`);

    if (wardens && wardens.length > 0) {
      const rows = wardens.map((w) => ({
        tenant_id: student.tenant_id,
        conversation_id: conversationId!,
        user_id: w.user_id,
        participant_role: "WARDEN" as const,
      }));
      await supabaseAdmin
        .from("conversation_participants")
        .upsert(rows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    }

    return { conversation_id: conversationId, warden_count: wardens?.length ?? 0 };
  });

const sendInput = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => sendInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .select("id, tenant_id, property_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (cErr || !conv) throw new Error("Conversation not found");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conv.id,
      tenant_id: conv.tenant_id,
      property_id: conv.property_id,
      sender_user_id: userId,
      message_type: "TEXT",
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversation_id)
      .eq("user_id", userId);
    return { ok: true };
  });
