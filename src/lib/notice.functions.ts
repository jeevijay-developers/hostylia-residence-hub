import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchNotification } from "@/lib/dispatch-notification";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_CUSTOM_BLOCKS, MAX_CUSTOM_STUDENTS } from "@/lib/notice-audience.constants";
import { NOTICE_CATEGORIES, withInApp } from "@/lib/notice-defaults";

type Client = SupabaseClient<Database>;
type NoticeInsert = Database["public"]["Tables"]["notices"]["Insert"];
type NoticeRecipientInsert = Database["public"]["Tables"]["notice_recipients"]["Insert"];

const NOTICE_AUDIENCES = [
  "ALL",
  "STUDENTS",
  "PARENTS",
  "WARDENS",
  "ACCOUNTANTS",
  "CUSTOM",
] as const;

const noticeSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  category: z.enum(NOTICE_CATEGORIES).default("GENERAL"),
  audience_type: z.enum(NOTICE_AUDIENCES).default("ALL"),
  // In-app is always included: the scheduled publisher delivers every notice in-app.
  channels: z
    .array(z.enum(["IN_APP", "SMS", "WHATSAPP", "EMAIL"]))
    .min(1)
    .transform(withInApp),
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
async function loadChannelAvailability(supabase: Client): Promise<NoticeChannelAvailabilityMap> {
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
async function assertNoticeStaff(supabase: Client, userId: string, tenantId: string) {
  for (const role of ["HOSTEL_ADMIN", "WARDEN"] as const) {
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

/** Refuses (with the reason) any external channel whose provider cannot deliver right now. */
async function assertChannelsAvailable(
  supabase: Client,
  userId: string,
  tenantId: string,
  channels: NoticeChannel[],
) {
  const external = channels.filter((c) => c !== "IN_APP");
  if (external.length === 0) return;
  await assertNoticeStaff(supabase, userId, tenantId);
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
    await assertChannelsAvailable(supabase, userId, data.tenant_id, data.channels);

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

    const row: NoticeInsert = {
      tenant_id: data.tenant_id,
      property_id: data.property_id,
      title: data.title,
      body: data.body,
      priority: data.priority,
      category: data.category,
      audience_type: data.audience_type,
      channels: data.channels,
      publish_at: publishing ? nowIso : data.publish_at,
      expires_at: data.expires_at ?? null,
      status,
      created_by: userId,
      published_by: publishing ? userId : null,
      published_at: publishing ? nowIso : null,
    };
    const { data: notice, error: insertError } = await supabase
      .from("notices")
      .insert(row)
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    // Custom audience: persist the resolved student list (also what the scheduled publisher reads).
    if (customAudience) {
      const rows: NoticeRecipientInsert[] = customAudience.students.map((s) => ({
        notice_id: notice.id,
        student_id: s.id,
        tenant_id: data.tenant_id,
        property_id: data.property_id,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: rErr } = await supabase
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

    // Everything below is scoped to this property (the same rules as fn_publish_scheduled_notices):
    // current residents only; parents only through a live student_guardians link to one of them; staff
    // only with an active assignment for this property or a tenant-wide one.
    const reachesStudents = ["ALL", "STUDENTS"].includes(data.audience_type);
    const reachesParents = ["ALL", "PARENTS"].includes(data.audience_type);
    const residents =
      reachesStudents || reachesParents
        ? ((
            await supabaseAdmin
              .from("students")
              .select("id, profile_id, phone, email")
              .eq("tenant_id", data.tenant_id)
              .eq("property_id", data.property_id)
              .is("deleted_at", null)
              .in("status", audience.ELIGIBLE_STUDENT_STATUSES)
          ).data ?? [])
        : [];
    if (reachesStudents) {
      for (const s of residents)
        if (s.profile_id)
          recipients.push({ user_id: s.profile_id, phone: s.phone, email: s.email });
    }
    if (reachesParents && residents.length > 0) {
      const residentIds = residents.map((s) => s.id);
      const guardianIds = new Set<string>();
      for (let i = 0; i < residentIds.length; i += 150) {
        const { data: links } = await supabaseAdmin
          .from("student_guardians")
          .select("guardian_id")
          .eq("tenant_id", data.tenant_id)
          .in("student_id", residentIds.slice(i, i + 150))
          .is("unlinked_at", null)
          .eq("portal_access_enabled", true)
          .eq("can_view_notices", true);
        for (const l of links ?? []) guardianIds.add(l.guardian_id);
      }
      const ids = [...guardianIds];
      for (let i = 0; i < ids.length; i += 150) {
        const { data: guardians } = await supabaseAdmin
          .from("guardians")
          .select("profile_id, phone, email")
          .eq("tenant_id", data.tenant_id)
          .in("id", ids.slice(i, i + 150))
          .is("deleted_at", null);
        for (const g of guardians ?? [])
          if (g.profile_id)
            recipients.push({ user_id: g.profile_id, phone: g.phone, email: g.email });
      }
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
        .is("revoked_at", null)
        .eq("is_active", true)
        // property_id is a validated uuid (and checked against the tenant above).
        .or(`property_id.is.null,property_id.eq.${data.property_id}`);
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

// ---------------------------------------------------------------------------------------------------------
// Editing, archiving, restoring and deleting notices
//
// A notice's phase (the Notices tab uses the same rules, src/lib/property-notices.ts):
//   SCHEDULED - status DRAFT / SCHEDULED and not past its expiry: not sent yet, everything can change.
//   ACTIVE    - status PUBLISHED and not past its expiry: already sent. Wording, category, priority and
//               expiry can be corrected; audience, channels and publish time cannot (deliveries that went out
//               are never recalled or re-sent).
//   ARCHIVED  - status EXPIRED / CANCELLED, or any notice past its expires_at: wording, category and
//               priority can still be corrected; it comes back only through Restore.
// Every write goes through the caller's own client, so the notices RLS policies (author or Hostel Admin
// may update) stay the boundary; a write that RLS filters out is reported, never silently ignored.
// ---------------------------------------------------------------------------------------------------------

type NoticeUpdate = Database["public"]["Tables"]["notices"]["Update"];
type NoticePhase = "SCHEDULED" | "ACTIVE" | "ARCHIVED";

const PENDING_STATUSES = ["DRAFT", "SCHEDULED"];

function msOrNull(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function noticePhase(
  n: { status: string; expires_at: string | null },
  now: number = Date.now(),
): NoticePhase {
  const expiry = msOrNull(n.expires_at);
  if (expiry !== null && expiry <= now) return "ARCHIVED";
  if (n.status === "PUBLISHED") return "ACTIVE";
  if (PENDING_STATUSES.includes(n.status)) return "SCHEDULED";
  return "ARCHIVED";
}

interface StoredNotice {
  id: string;
  tenant_id: string;
  property_id: string;
  status: string;
  audience_type: string;
  channels: string[];
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
}

/** Read through RLS: a notice the caller may not see is "not found". */
async function loadNotice(supabase: Client, id: string): Promise<StoredNotice> {
  const { data, error } = await supabase
    .from("notices")
    .select(
      "id, tenant_id, property_id, status, audience_type, channels, publish_at, published_at, expires_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Notice not found");
  return data;
}

/**
 * Applies `patch` through the caller's client. `onlyStatuses` guards against a concurrent change (e.g. the
 * scheduler publishing the notice meanwhile). A write that RLS (or the guard) filters out is an error.
 */
async function updateNotice(
  supabase: Client,
  id: string,
  patch: NoticeUpdate,
  onlyStatuses?: string[],
): Promise<void> {
  let q = supabase.from("notices").update(patch).eq("id", id).is("deleted_at", null);
  if (onlyStatuses) q = q.in("status", onlyStatuses);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      "This notice could not be updated. It may have changed in the meantime, or you may not have permission to edit it.",
    );
  }
}

async function listRecipientIds(client: Client, noticeId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("notice_recipients")
      .select("student_id")
      .eq("notice_id", noticeId)
      .range(from, from + 999);
    if (error) throw new Error("Could not read the notice's recipient list. Please try again.");
    const rows = data ?? [];
    for (const r of rows) ids.push(r.student_id);
    if (rows.length < 1000) return ids;
  }
}

/**
 * Makes a CUSTOM notice's recipient list exactly `studentIds` (already validated + de-duplicated by
 * resolveCustomAudience). New rows go in first, then stale ones are removed, so a failure never leaves the
 * notice with fewer recipients than before. notice_recipients is append-only for end users, hence the
 * service client, used only after the caller's permission was checked and the notice row was updated
 * through their own client.
 */
async function replaceRecipients(admin: Client, notice: StoredNotice, studentIds: string[]) {
  const keep = new Set(studentIds);
  const rows: NoticeRecipientInsert[] = studentIds.map((sid) => ({
    notice_id: notice.id,
    student_id: sid,
    tenant_id: notice.tenant_id,
    property_id: notice.property_id,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("notice_recipients").upsert(rows.slice(i, i + 500), {
      onConflict: "notice_id,student_id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error("Could not save the new recipient list. Please try again.");
  }
  const stale = (await listRecipientIds(admin, notice.id)).filter((sid) => !keep.has(sid));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await admin
      .from("notice_recipients")
      .delete()
      .eq("notice_id", notice.id)
      .in("student_id", stale.slice(i, i + 200));
    if (error) throw new Error("Could not update the recipient list. Please try again.");
  }
}

const sameChannels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((c) => b.includes(c));

const editNoticeSchema = z.object({
  notice_id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
  // Everything below is optional, so callers that only correct title/body/priority keep working.
  category: z.enum(NOTICE_CATEGORIES).optional(),
  audience_type: z.enum(NOTICE_AUDIENCES).optional(),
  // CUSTOM only: replaces the stored recipient list. Omitted with CUSTOM = keep the stored list.
  custom_recipients: z
    .object({
      student_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_STUDENTS).default([]),
      block_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_BLOCKS).default([]),
    })
    .optional(),
  // In-app is always included (see noticeSchema).
  channels: z
    .array(z.enum(["IN_APP", "SMS", "WHATSAPP", "EMAIL"]))
    .min(1)
    .transform(withInApp)
    .optional(),
  // Not-yet-sent notices only. publish_now: goes out on the scheduler's next run (every 5 minutes).
  publish_now: z.boolean().optional(),
  publish_at: z.string().datetime().nullable().optional(),
  // undefined = unchanged, null = no expiry.
  expires_at: z.string().datetime().nullable().optional(),
});

export type EditNoticeInput = z.input<typeof editNoticeSchema>;

/**
 * Edits a notice within the rules of its phase (see above). Does not re-dispatch: notifications that were
 * already sent are not recalled. For a notice that has not been sent yet, audience / channels / timing can
 * change; "publish now" hands it to the scheduled publisher, the same single delivery path every scheduled
 * notice uses.
 */
export const editNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => editNoticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cur = await loadNotice(supabase, data.notice_id);
    const now = Date.now();
    const phase = noticePhase(cur, now);

    const audienceChange =
      data.audience_type !== undefined &&
      (data.audience_type !== cur.audience_type ||
        (data.audience_type === "CUSTOM" && data.custom_recipients !== undefined));
    const channelsChange =
      data.channels !== undefined && !sameChannels(data.channels, cur.channels);
    const curPublishMs = msOrNull(cur.publish_at);
    const scheduleChange =
      data.publish_now === true ||
      (data.publish_at != null && msOrNull(data.publish_at) !== curPublishMs);
    const curExpiryMs = msOrNull(cur.expires_at);
    const expiryChange = data.expires_at !== undefined && msOrNull(data.expires_at) !== curExpiryMs;

    if ((audienceChange || channelsChange || scheduleChange) && phase !== "SCHEDULED") {
      throw new Error(
        phase === "ACTIVE"
          ? "This notice has already been sent, so its audience, channels and publish time can no longer change."
          : "This notice is archived. Restore it before changing how it is sent.",
      );
    }
    if (expiryChange && phase === "ARCHIVED") {
      throw new Error("This notice is archived. Use Restore to give it a new expiry.");
    }

    const patch: NoticeUpdate = { title: data.title, body: data.body, priority: data.priority };
    if (data.category !== undefined) patch.category = data.category;

    // Timing. An expiry must be in the future and after the moment the notice goes out.
    let publishMs =
      phase === "SCHEDULED" ? curPublishMs : (msOrNull(cur.published_at) ?? curPublishMs);
    if (scheduleChange) {
      if (data.publish_now) {
        publishMs = now;
      } else {
        const t = msOrNull(data.publish_at);
        if (t === null || t <= now) throw new Error("The schedule time must be in the future");
        publishMs = t;
      }
      patch.publish_at = new Date(publishMs).toISOString();
      patch.status = "SCHEDULED";
    }
    const expiryMs = expiryChange ? msOrNull(data.expires_at) : curExpiryMs;
    if (expiryChange) {
      if (expiryMs !== null && expiryMs <= now) {
        throw new Error("The expiry time must be in the future");
      }
      patch.expires_at = data.expires_at ?? null;
    }
    if (
      (expiryChange || scheduleChange) &&
      expiryMs !== null &&
      publishMs !== null &&
      expiryMs <= publishMs
    ) {
      throw new Error("The expiry time must be after the publish time");
    }

    if (channelsChange && data.channels) {
      await assertChannelsAvailable(supabase, userId, cur.tenant_id, data.channels);
      patch.channels = data.channels;
    }

    // Audience. A custom selection is validated exactly as publishNotice validates it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let newRecipients: string[] | null = null;
    if (audienceChange && data.audience_type) {
      const audience = await import("@/lib/notice-audience.server");
      if (data.audience_type === "CUSTOM") {
        const sel = data.custom_recipients;
        if (!sel || (sel.student_ids.length === 0 && sel.block_ids.length === 0)) {
          throw new Error("Choose the residents or blocks this notice is for");
        }
        await audience.assertNoticeAudienceAccess(
          supabase,
          supabaseAdmin,
          userId,
          cur.tenant_id,
          cur.property_id,
        );
        const resolved = await audience.resolveCustomAudience(supabaseAdmin, {
          tenantId: cur.tenant_id,
          propertyId: cur.property_id,
          studentIds: [...new Set(sel.student_ids)],
          blockIds: [...new Set(sel.block_ids)],
        });
        if (resolved.students.length === 0) {
          throw new Error("The selected audience has no eligible recipients");
        }
        newRecipients = resolved.students.map((s) => s.id);
      } else if (
        data.custom_recipients &&
        (data.custom_recipients.student_ids.length > 0 ||
          data.custom_recipients.block_ids.length > 0)
      ) {
        throw new Error("Recipients can only be selected for a custom audience");
      }
      patch.audience_type = data.audience_type;
    }

    // While the recipient list changes, the publish time is written last, so the scheduler can never pick
    // the notice up with a half-written list.
    const schedulePatch: NoticeUpdate = {};
    if (newRecipients && patch.publish_at !== undefined) {
      schedulePatch.publish_at = patch.publish_at;
      schedulePatch.status = patch.status;
      delete patch.publish_at;
      delete patch.status;
    }

    const guard =
      phase === "SCHEDULED" ? PENDING_STATUSES : phase === "ACTIVE" ? ["PUBLISHED"] : undefined;
    await updateNotice(supabase, cur.id, patch, guard);

    if (newRecipients) {
      try {
        await replaceRecipients(supabaseAdmin, cur, newRecipients);
      } catch (e) {
        if (cur.audience_type !== "CUSTOM") {
          // Never leave a custom notice without its list: put the previous audience back.
          await supabase
            .from("notices")
            .update({ audience_type: cur.audience_type })
            .eq("id", cur.id);
        }
        throw e;
      }
      if (schedulePatch.publish_at !== undefined) {
        await updateNotice(supabase, cur.id, schedulePatch, PENDING_STATUSES);
      }
    } else if (audienceChange && cur.audience_type === "CUSTOM") {
      // No longer a custom notice: its old list is unused (only CUSTOM notices read it). Best effort.
      await supabaseAdmin.from("notice_recipients").delete().eq("notice_id", cur.id);
    }

    return {
      ok: true as const,
      recipient_count: newRecipients ? newRecipients.length : null,
      queued_for_next_run: scheduleChange && data.publish_now === true,
    };
  });

/**
 * Archive: a notice that has not been sent yet is cancelled (it will never go out); a live notice expires
 * now (it drops out of every feed; nothing that was delivered is recalled).
 */
export const archiveNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cur = await loadNotice(supabase, data.notice_id);
    const phase = noticePhase(cur);
    if (phase === "SCHEDULED") {
      await updateNotice(supabase, cur.id, { status: "CANCELLED" }, PENDING_STATUSES);
      return { ok: true as const, archived_as: "CANCELLED" as const };
    }
    if (phase === "ACTIVE") {
      await updateNotice(
        supabase,
        cur.id,
        { status: "EXPIRED", expires_at: new Date().toISOString() },
        ["PUBLISHED"],
      );
      return { ok: true as const, archived_as: "EXPIRED" as const };
    }
    throw new Error("This notice is already archived");
  });

/**
 * Restore an archived notice.
 *  - One that was published and then expired goes back to PUBLISHED with the new expiry (or none). Nothing
 *    is re-sent; it is simply visible in feeds again (fn_notices_guard_expiry allows exactly this).
 *  - One that was cancelled (or expired) before it went out goes back to SCHEDULED for a future time.
 */
export const restoreNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        notice_id: z.string().uuid(),
        expires_at: z.string().datetime().nullable().default(null),
        publish_at: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cur = await loadNotice(supabase, data.notice_id);
    const now = Date.now();
    if (noticePhase(cur, now) !== "ARCHIVED") throw new Error("This notice is not archived");
    const expiryMs = msOrNull(data.expires_at);
    if (expiryMs !== null && expiryMs <= now) {
      throw new Error("The new expiry time must be in the future");
    }

    const wasPublished =
      cur.status === "PUBLISHED" || (cur.status === "EXPIRED" && cur.published_at !== null);
    if (wasPublished) {
      await updateNotice(supabase, cur.id, { status: "PUBLISHED", expires_at: data.expires_at }, [
        cur.status,
      ]);
      return { ok: true as const, restored_to: "PUBLISHED" as const };
    }
    if (cur.status === "EXPIRED") {
      throw new Error(
        "This notice expired before it was ever sent, so it can't be restored. Create a new notice instead.",
      );
    }

    const publishMs = data.publish_at ? msOrNull(data.publish_at) : msOrNull(cur.publish_at);
    if (publishMs === null || publishMs <= now) {
      throw new Error("Choose a future time to send this notice");
    }
    if (expiryMs !== null && expiryMs <= publishMs) {
      throw new Error("The expiry time must be after the publish time");
    }
    if (cur.audience_type === "CUSTOM") {
      const ids = await listRecipientIds(supabase, cur.id);
      if (ids.length === 0) {
        throw new Error(
          "This custom notice has no saved recipients, so it can't be restored. Create a new notice instead.",
        );
      }
    }
    await updateNotice(
      supabase,
      cur.id,
      {
        status: "SCHEDULED",
        publish_at: new Date(publishMs).toISOString(),
        expires_at: data.expires_at,
      },
      [cur.status],
    );
    return { ok: true as const, restored_to: "SCHEDULED" as const };
  });

/**
 * Soft delete (deleted_at). The notice disappears from every list and feed; a notice that has not been sent
 * yet is also cancelled so it can never go out. Allowed to the notice's author and Hostel Admins (RLS).
 */
export const deleteNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cur = await loadNotice(supabase, data.notice_id);
    const pending = noticePhase(cur) === "SCHEDULED";
    const patch: NoticeUpdate = { deleted_at: new Date().toISOString() };
    if (pending) patch.status = "CANCELLED";
    await updateNotice(supabase, cur.id, patch, pending ? PENDING_STATUSES : undefined);
    return { ok: true as const };
  });

export const cancelNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notices")
      .update({ status: "CANCELLED" })
      .eq("id", data.notice_id)
      .in("status", ["DRAFT", "SCHEDULED"])
      .select("id");
    if (error) throw new Error(error.message);
    // RLS (author or Hostel Admin) or a concurrent publish filters the update out: say so.
    if (!rows || rows.length === 0) {
      throw new Error(
        "This notice could not be cancelled. It may have been sent in the meantime, or you may not have permission to change it.",
      );
    }
    return { ok: true as const };
  });
