import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchNotification } from "@/lib/dispatch-notification";
import { MAX_CUSTOM_BLOCKS, MAX_CUSTOM_STUDENTS } from "@/lib/notice-audience.constants";

const noticeSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  audience_type: z
    .enum(["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS", "CUSTOM"])
    .default("ALL"),
  channels: z.array(z.enum(["IN_APP", "SMS", "WHATSAPP", "EMAIL"])).min(1),
  publish_at: z.string().datetime().optional().nullable(),
  // Optional end of life (UTC instant; the composer converts the IST time the admin typed).
  expires_at: z.string().datetime().optional().nullable(),
  publish_now: z.boolean().default(true),
  // Only for audience_type CUSTOM: individually selected students and/or whole blocks. Re-validated
  // against the tenant + property on the server; never trusted as sent.
  custom_student_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_STUDENTS).default([]),
  custom_block_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_BLOCKS).default([]),
});

export type NoticeChannel = "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL";
export interface NoticeChannelAvailability {
  available: boolean;
  /** Safe to show to the user; null when the channel is available. Never a variable name or secret. */
  reason: string | null;
}
export type NoticeChannelAvailabilityMap = Record<NoticeChannel, NoticeChannelAvailability>;

const EXTERNAL_CHANNELS = ["SMS", "WHATSAPP", "EMAIL"] as const;
const CHANNEL_LABEL: Record<NoticeChannel, string> = {
  IN_APP: "In-app",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

function allExternalUnavailable(reason: string): NoticeChannelAvailabilityMap {
  return {
    IN_APP: { available: true, reason: null },
    SMS: { available: false, reason },
    WHATSAPP: { available: false, reason },
    EMAIL: { available: false, reason },
  };
}

/**
 * Asks the `send-notification` Edge Function (which owns the provider secrets: MSG91 / Twilio / Resend)
 * which channels it can really deliver for a notice. The browser only ever receives booleans and a
 * short reason. If the answer can't be obtained, external channels are reported unavailable - never
 * assumed available.
 */
async function loadChannelAvailability(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<NoticeChannelAvailabilityMap> {
  // Server env only, same secret dispatchNotification() uses.
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET;
  if (!internalSecret) return allExternalUnavailable("Notification service is not configured");
  try {
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: { action: "provider_status", templateKey: "notice_broadcast" },
      headers: { "x-hostylia-internal": internalSecret },
    });
    const channels = data?.channels as
      Partial<Record<NoticeChannel, { available?: unknown; reason?: unknown }>> | undefined;
    if (error || !data?.ok || !channels)
      return allExternalUnavailable("Could not verify provider status");
    const out = allExternalUnavailable("Provider not configured");
    for (const ch of EXTERNAL_CHANNELS) {
      const c = channels[ch];
      const available = c?.available === true;
      out[ch] = {
        available,
        reason: available
          ? null
          : typeof c?.reason === "string" && c.reason.length > 0
            ? c.reason.slice(0, 200)
            : "Provider not configured",
      };
    }
    return out;
  } catch {
    return allExternalUnavailable("Could not verify provider status");
  }
}

// Notices are written by Hostel Admins and Wardens (and platform admins); the provider status is only
// shown to them.
async function assertNoticeStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tenantId: string,
) {
  for (const role of ["HOSTEL_ADMIN", "WARDEN"]) {
    const { data, error } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: tenantId,
      _role: role,
    });
    if (error) throw new Error(error.message);
    if (data) return;
  }
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isSuper) throw new Error("You do not have permission to manage notices");
}

export const getNoticeChannelAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertNoticeStaff(context.supabase, context.userId, data.tenant_id);
    return loadChannelAvailability(context.supabase);
  });

/** What the user may be told about a failed dispatch. The edge function's own message can name env vars. */
function deliveryFailureReason(result: { error_code?: string }): string {
  switch (result.error_code) {
    case "PROVIDER_NOT_CONFIGURED":
      return "Provider not configured";
    case "BAD_REQUEST":
      return "Invalid notification request";
    case "UNAUTHORIZED":
      return "Notification service rejected the request";
    default:
      return "Could not be sent to the delivery service";
  }
}

/**
 * Create a notice + fan out send-notification calls per recipient/channel.
 * IN_APP is always instant. SMS/WHATSAPP/EMAIL are refused up front when their provider is not
 * configured (checked against the same logic the sender uses), and any failure while queuing is
 * reported per channel instead of being swallowed. Actual provider delivery is asynchronous (retried
 * by the retry-failed-notifications job); only queue-time failures are known here.
 */
export const publishNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => noticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const audience = await import("@/lib/notice-audience.server");

    // Scope first. tenant_id and property_id both come from the browser, and recipients are looked up by
    // property, so the property must really belong to the tenant (all audiences).
    const customStudentIds = [...new Set(data.custom_student_ids)];
    const customBlockIds = [...new Set(data.custom_block_ids)];
    let customAudience: Awaited<ReturnType<typeof audience.resolveCustomAudience>> | null = null;
    if (data.audience_type === "CUSTOM") {
      // Permission + every id validated against tenant/property (strict: any bad id rejects the lot);
      // blocks expand to their eligible residents and the list is de-duplicated.
      await audience.assertNoticeAudienceAccess(
        supabase,
        supabaseAdmin,
        userId,
        data.tenant_id,
        data.property_id,
      );
      customAudience = await audience.resolveCustomAudience(supabaseAdmin, {
        tenantId: data.tenant_id,
        propertyId: data.property_id,
        studentIds: customStudentIds,
        blockIds: customBlockIds,
      });
      if (customAudience.students.length === 0) {
        throw new Error("The selected audience has no eligible recipients");
      }
    } else {
      await audience.assertPropertyInTenant(supabaseAdmin, data.tenant_id, data.property_id);
      if (customStudentIds.length > 0 || customBlockIds.length > 0) {
        throw new Error("Recipients can only be selected for a custom audience");
      }
    }

    // Never trust the UI: a channel whose provider is not configured is rejected here, before anything
    // is written, with the reason.
    const external = data.channels.filter((c) => c !== "IN_APP");
    if (external.length > 0) {
      await assertNoticeStaff(supabase, userId, data.tenant_id);
      const availability = await loadChannelAvailability(supabase);
      const blocked = external.filter((c) => !availability[c].available);
      if (blocked.length > 0) {
        const list = blocked
          .map((c) => `${CHANNEL_LABEL[c]} (${availability[c].reason ?? "unavailable"})`)
          .join(", ");
        const them = blocked.length > 1 ? "them" : "it";
        throw new Error(
          `Cannot send via ${list}. Deselect ${them} or ask your administrator to configure the provider.`,
        );
      }
    }

    const publishing = data.publish_now || !data.publish_at;
    const status = publishing ? "PUBLISHED" : "SCHEDULED";
    const nowIso = new Date().toISOString();

    // An expiry must be in the future and after the moment the notice goes out. Checked before anything
    // is written; the database refuses to publish an already-expired notice as well.
    if (data.expires_at) {
      const expiresMs = Date.parse(data.expires_at);
      const publishMs = publishing ? Date.now() : Date.parse(data.publish_at as string);
      if (expiresMs <= Date.now()) throw new Error("The expiry time must be in the future");
      if (expiresMs <= publishMs) {
        throw new Error("The expiry time must be after the scheduled publish time");
      }
    }

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
        expires_at: data.expires_at ?? null,
        status,
        created_by: userId,
        published_by: publishing ? userId : null,
        published_at: publishing ? nowIso : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Custom audience: persist the resolved student list (also what the scheduled publisher reads).
    // notice_recipients is not in the generated types yet, so it is written through a narrow signature.
    if (customAudience) {
      const rows = customAudience.students.map((s) => ({
        notice_id: notice.id,
        student_id: s.id,
        tenant_id: data.tenant_id,
        property_id: data.property_id,
      }));
      const loose = supabase as unknown as {
        from: (t: string) => {
          insert: (r: unknown[]) => PromiseLike<{ error: { message: string } | null }>;
        };
      };
      for (let i = 0; i < rows.length; i += 500) {
        const { error: rErr } = await loose
          .from("notice_recipients")
          .insert(rows.slice(i, i + 500));
        if (rErr) {
          // Never leave a custom notice without its recipients (a scheduled one would publish to nobody).
          await supabase.from("notices").update({ status: "CANCELLED" }).eq("id", notice.id);
          throw new Error(
            "Could not save the recipient list, so the notice was not sent. Please try again.",
          );
        }
      }
    }
    const recipientCount = customAudience ? customAudience.students.length : null;

    if (!publishing) {
      return {
        notice_id: notice.id,
        recipient_count: recipientCount,
        dispatched: 0,
        failed: 0,
        failures: [] as { channel: NoticeChannel; count: number; reason: string }[],
        skipped: [] as { channel: NoticeChannel; count: number }[],
      };
    }

    // Resolve recipients (best-effort; RLS lets admins/wardens see needed rows via server context).
    // For IN_APP we can directly insert notifications with SECURITY DEFINER via edge fn.
    const recipients: {
      user_id: string;
      phone?: string | null;
      email?: string | null;
      /** false: no portal account, so no in-app notification is possible. */
      can_in_app?: boolean;
    }[] = [];

    // Custom audience: exactly the validated, de-duplicated students (with or without a portal account).
    if (customAudience) {
      for (const s of customAudience.students) {
        recipients.push({
          user_id: s.profile_id ?? `student:${s.id}`,
          phone: s.phone,
          email: s.email,
          can_in_app: !!s.profile_id,
        });
      }
    }

    if (["ALL", "STUDENTS"].includes(data.audience_type)) {
      const { data: students } = await supabaseAdmin
        .from("students")
        .select("profile_id, phone, email")
        .eq("property_id", data.property_id)
        .is("deleted_at", null);
      for (const s of students ?? [])
        if (s.profile_id)
          recipients.push({ user_id: s.profile_id, phone: s.phone, email: s.email });
    }
    if (["ALL", "PARENTS"].includes(data.audience_type)) {
      const { data: guardians } = await supabaseAdmin
        .from("guardians")
        .select("profile_id, phone, email, tenant_id")
        .eq("tenant_id", data.tenant_id);
      for (const g of guardians ?? [])
        if (g.profile_id)
          recipients.push({ user_id: g.profile_id, phone: g.phone, email: g.email });
    }
    if (["ALL", "WARDENS", "ACCOUNTANTS"].includes(data.audience_type)) {
      const roles =
        data.audience_type === "ALL"
          ? ["WARDEN", "ACCOUNTANT", "HOSTEL_ADMIN"]
          : data.audience_type === "WARDENS"
            ? ["WARDEN"]
            : ["ACCOUNTANT"];
      const { data: ras } = await supabaseAdmin
        .from("role_assignments")
        .select("user_id")
        .eq("tenant_id", data.tenant_id)
        .in("role", roles as never[])
        .is("revoked_at", null);
      const userIds = Array.from(
        new Set((ras ?? []).map((r) => r.user_id).filter(Boolean)),
      ) as string[];
      if (userIds.length) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, phone, email")
          .in("id", userIds);
        for (const p of profiles ?? [])
          recipients.push({ user_id: p.id, phone: p.phone, email: p.email });
      }
    }

    // Dispatch (dedup users) — queued concurrently, not one-by-one, so
    // broadcasting to a large audience doesn't block the caller for the
    // sum of every recipient's round trip. Each dispatchNotification() call
    // itself only waits for the notification job to be queued, never for
    // actual provider delivery (see dispatch-notification.ts).
    const seen = new Set<string>();
    const dispatches: Promise<{
      channel: NoticeChannel;
      result: Awaited<ReturnType<typeof dispatchNotification>>;
    }>[] = [];
    const skippedCount: Partial<Record<NoticeChannel, number>> = {};
    const skip = (ch: NoticeChannel) => {
      skippedCount[ch] = (skippedCount[ch] ?? 0) + 1;
    };
    for (const r of recipients) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      for (const ch of data.channels) {
        const recipient: Record<string, string | undefined> = {};
        if (ch === "IN_APP") {
          if (r.can_in_app === false) {
            skip(ch);
            continue;
          }
          recipient.userId = r.user_id;
        }
        if (ch === "SMS" || ch === "WHATSAPP") {
          recipient.phone = r.phone ?? undefined;
          if (!recipient.phone) {
            skip(ch);
            continue;
          }
        }
        if (ch === "EMAIL") {
          recipient.email = r.email ?? undefined;
          if (!recipient.email) {
            skip(ch);
            continue;
          }
        }
        dispatches.push(
          dispatchNotification(supabase, {
            channel: ch,
            templateKey: "notice_broadcast",
            recipient,
            variables: { title: data.title, body: data.body },
            eventType: "NOTICE_BROADCAST",
            tenantId: data.tenant_id,
            propertyId: data.property_id,
            referenceId: notice.id,
          }).then((result) => ({ channel: ch, result })),
        );
      }
    }
    const settled = await Promise.all(dispatches);

    const failedBy = new Map<string, { channel: NoticeChannel; count: number; reason: string }>();
    let failed = 0;
    for (const { channel, result } of settled) {
      if (result?.ok) continue;
      failed++;
      const reason = deliveryFailureReason(result ?? {});
      const key = `${channel}:${reason}`;
      const cur = failedBy.get(key);
      if (cur) cur.count++;
      else failedBy.set(key, { channel, count: 1, reason });
    }
    return {
      notice_id: notice.id,
      recipient_count: recipientCount,
      dispatched: settled.length - failed,
      failed,
      failures: [...failedBy.values()],
      skipped: (Object.entries(skippedCount) as [NoticeChannel, number][]).map(
        ([channel, count]) => ({ channel, count }),
      ),
    };
  });

const editNoticeSchema = z.object({
  notice_id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
});

/** Corrects title/body/priority on an existing notice. Does not re-dispatch —
 * already-sent SMS/WhatsApp/email/in-app notifications are not recalled. */
export const editNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => editNoticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notices")
      .update({ title: data.title, body: data.body, priority: data.priority })
      .eq("id", data.notice_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const cancelNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notices")
      .update({ status: "CANCELLED" })
      .eq("id", data.notice_id)
      .in("status", ["DRAFT", "SCHEDULED"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
