import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const noticeSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  audience_type: z.enum(["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS", "CUSTOM"]).default("ALL"),
  channels: z.array(z.enum(["IN_APP", "SMS", "WHATSAPP", "EMAIL"])).min(1),
  publish_at: z.string().datetime().optional().nullable(),
  publish_now: z.boolean().default(true),
});

/**
 * Create a notice + fan out send-notification calls per recipient/channel.
 * IN_APP is always instant; SMS/WHATSAPP/EMAIL depend on provider secrets
 * — the dispatcher returns PROVIDER_NOT_CONFIGURED cleanly when absent.
 */
export const publishNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => noticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const publishing = data.publish_now || !data.publish_at;
    const status = publishing ? "PUBLISHED" : "SCHEDULED";
    const nowIso = new Date().toISOString();

    const { data: notice, error } = await supabase
      .from("notices")
      .insert({
        tenant_id: data.tenant_id,
        property_id: data.property_id,
        title: data.title,
        body: data.body,
        priority: data.priority,
        audience_type: data.audience_type,
        channels: data.channels,
        publish_at: publishing ? nowIso : data.publish_at,
        status,
        created_by: userId,
        published_by: publishing ? userId : null,
        published_at: publishing ? nowIso : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (!publishing) return { notice_id: notice.id, dispatched: 0 };

    // Resolve recipients (best-effort; RLS lets admins/wardens see needed rows via server context).
    // For IN_APP we can directly insert notifications with SECURITY DEFINER via edge fn.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const recipients: { user_id: string; phone?: string | null; email?: string | null }[] = [];

    if (["ALL", "STUDENTS"].includes(data.audience_type)) {
      const { data: students } = await supabaseAdmin
        .from("students")
        .select("profile_id, phone, email")
        .eq("property_id", data.property_id)
        .is("deleted_at", null);
      for (const s of students ?? []) if (s.profile_id) recipients.push({ user_id: s.profile_id, phone: s.phone, email: s.email });
    }
    if (["ALL", "PARENTS"].includes(data.audience_type)) {
      const { data: guardians } = await supabaseAdmin
        .from("guardians")
        .select("profile_id, phone, email, tenant_id")
        .eq("tenant_id", data.tenant_id);
      for (const g of guardians ?? []) if (g.profile_id) recipients.push({ user_id: g.profile_id, phone: g.phone, email: g.email });
    }
    if (["ALL", "WARDENS", "ACCOUNTANTS"].includes(data.audience_type)) {
      const roles = data.audience_type === "ALL"
        ? ["WARDEN", "ACCOUNTANT", "HOSTEL_ADMIN"]
        : data.audience_type === "WARDENS"
          ? ["WARDEN"]
          : ["ACCOUNTANT"];
      const { data: ras } = await supabaseAdmin
        .from("role_assignments")
        .select("user_id, profiles(phone, email)")
        .eq("tenant_id", data.tenant_id)
        .in("role", roles as never[])
        .is("revoked_at", null);
      for (const r of ras ?? []) recipients.push({
        user_id: r.user_id as string,
        phone: (r as any).profiles?.phone,
        email: (r as any).profiles?.email,
      });
    }

    // Dispatch (dedup users)
    const seen = new Set<string>();
    let dispatched = 0;
    for (const r of recipients) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      for (const ch of data.channels) {
        const recipient: Record<string, string | undefined> = {};
        if (ch === "IN_APP") recipient.userId = r.user_id;
        if (ch === "SMS" || ch === "WHATSAPP") { recipient.phone = r.phone ?? undefined; if (!recipient.phone) continue; }
        if (ch === "EMAIL") { recipient.email = r.email ?? undefined; if (!recipient.email) continue; }
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: ch,
            templateKey: "notice_broadcast",
            recipient,
            variables: { title: data.title, body: data.body },
            eventType: "NOTICE_BROADCAST",
            tenantId: data.tenant_id,
            propertyId: data.property_id,
            referenceId: notice.id,
          },
        });
        dispatched++;
      }
    }
    return { notice_id: notice.id, dispatched };
  });

export const cancelNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notices")
      .update({ status: "CANCELLED" })
      .eq("id", data.notice_id)
      .in("status", ["DRAFT", "SCHEDULED"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
