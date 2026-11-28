import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getNoticeChannelAvailability } from "@/lib/notice.functions";
import {
  isNoticeCategory,
  readNoticeDefaultChannels,
  type NoticeCategory,
  type NoticeChannelKey,
} from "@/lib/notice-defaults";

/**
 * Data for a property's Notices tab. Plain RLS reads (staff see their property's notices through the
 * "notices author or admin manage" policy); the list is filtered and paged in the database, 8 per page.
 *
 * Status shown in the tab ("phase"), derived from the stored lifecycle:
 *   Active    - status PUBLISHED and (no expires_at, or expires_at still in the future).
 *   Scheduled - status SCHEDULED / DRAFT and not past expires_at: not sent yet.
 *   Archived  - status EXPIRED or CANCELLED, or ANY notice whose expires_at has passed (the expiry job only
 *               flips PUBLISHED -> EXPIRED every 5 minutes; the tab treats it as archived immediately).
 * The three are disjoint and together cover every non-deleted notice. Deleted (deleted_at) notices are
 * never shown. The same rules decide what the server lets you edit (src/lib/notice.functions.ts).
 */

export const NOTICE_PAGE = 8;

export const NOTICE_FILTERS = ["ALL", "ACTIVE", "SCHEDULED", "ARCHIVED"] as const;
export type NoticeFilter = (typeof NOTICE_FILTERS)[number];
export type NoticePhase = Exclude<NoticeFilter, "ALL">;

export const NOTICE_AUDIENCES = [
  "ALL",
  "STUDENTS",
  "PARENTS",
  "WARDENS",
  "ACCOUNTANTS",
  "CUSTOM",
] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export function isNoticeAudience(v: unknown): v is NoticeAudience {
  return typeof v === "string" && (NOTICE_AUDIENCES as readonly string[]).includes(v);
}

const PENDING = ["DRAFT", "SCHEDULED"];

export function noticePhase(
  n: { status: string; expires_at: string | null },
  now: number = Date.now(),
): NoticePhase {
  const expiry = n.expires_at ? Date.parse(n.expires_at) : Number.NaN;
  if (!Number.isNaN(expiry) && expiry <= now) return "ARCHIVED";
  if (n.status === "PUBLISHED") return "ACTIVE";
  if (PENDING.includes(n.status)) return "SCHEDULED";
  return "ARCHIVED";
}

/** An archived notice can come back unless it expired before it was ever sent (the database forbids that). */
export function canRestoreNotice(
  n: { status: string; published_at: string | null },
  phase: NoticePhase,
): boolean {
  if (phase !== "ARCHIVED") return false;
  return !(n.status === "EXPIRED" && !n.published_at);
}

export interface PropertyNotice {
  id: string;
  tenant_id: string;
  property_id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  priority: string;
  audience_type: string;
  channels: string[];
  status: string;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  /** CUSTOM notices: how many residents are on the stored recipient list. */
  recipientCount: number | null;
}

async function recipientCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await supabase
        .from("notice_recipients")
        .select("student_id", { count: "exact", head: true })
        .eq("notice_id", id);
      if (!error && count !== null) out.set(id, count);
    }),
  );
  return out;
}

async function toNotices(rows: Tables<"notices">[]): Promise<PropertyNotice[]> {
  const custom = rows.filter((r) => r.audience_type === "CUSTOM").map((r) => r.id);
  const counts = custom.length ? await recipientCounts(custom) : new Map<string, number>();
  return rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    property_id: r.property_id,
    title: r.title,
    body: r.body,
    // notices_category_check limits the column to NOTICE_CATEGORIES; this narrows the generated `string`.
    category: isNoticeCategory(r.category) ? r.category : "GENERAL",
    priority: r.priority,
    audience_type: r.audience_type,
    channels: r.channels ?? [],
    status: r.status,
    publish_at: r.publish_at,
    published_at: r.published_at,
    expires_at: r.expires_at,
    created_at: r.created_at,
    recipientCount: r.audience_type === "CUSTOM" ? (counts.get(r.id) ?? null) : null,
  }));
}

const notLapsed = (nowIso: string) => `expires_at.is.null,expires_at.gt.${nowIso}`;

export interface NoticeCounts {
  total: number;
  active: number;
  scheduled: number;
  archived: number;
}

export function useNoticeCounts(propertyId: string) {
  return useQuery({
    queryKey: ["property-notices", propertyId, "counts"],
    queryFn: async (): Promise<NoticeCounts> => {
      const nowIso = new Date().toISOString();
      const base = () =>
        supabase
          .from("notices")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .is("deleted_at", null);
      const res = await Promise.all([
        base(),
        base().eq("status", "PUBLISHED").or(notLapsed(nowIso)),
        base().in("status", PENDING).or(notLapsed(nowIso)),
        base().or(`status.in.(EXPIRED,CANCELLED),expires_at.lte.${nowIso}`),
      ]);
      if (res.some((r) => r.error)) {
        throw new Error("We couldn't load the notice counts. Please try again.");
      }
      const [total, active, scheduled, archived] = res.map((r) => r.count ?? 0);
      return { total, active, scheduled, archived };
    },
  });
}

interface NoticeListOptions {
  q: string;
  filter: NoticeFilter;
  category: NoticeCategory | "ALL";
  /** null = every audience. */
  audience: NoticeAudience | null;
  page: number;
}

/** One page (8) of the property's notices, newest publish time first, filtered in the database. */
export function useNoticeList(propertyId: string, opts: NoticeListOptions) {
  return useQuery({
    queryKey: [
      "property-notices",
      propertyId,
      "list",
      opts.q,
      opts.filter,
      opts.category,
      opts.audience,
      opts.page,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: PropertyNotice[]; total: number }> => {
      const nowIso = new Date().toISOString();
      const from = opts.page * NOTICE_PAGE;
      // PostgREST's or() treats , ( ) as separators — keep them out of the term.
      const term = opts.q.replace(/[,()*%\\"]/g, " ").trim();
      let query = supabase
        .from("notices")
        .select("*", { count: "exact" })
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("publish_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, from + NOTICE_PAGE - 1);
      if (opts.filter === "ACTIVE") query = query.eq("status", "PUBLISHED").or(notLapsed(nowIso));
      if (opts.filter === "SCHEDULED") query = query.in("status", PENDING).or(notLapsed(nowIso));
      if (opts.filter === "ARCHIVED") {
        query = query.or(`status.in.(EXPIRED,CANCELLED),expires_at.lte.${nowIso}`);
      }
      if (opts.audience) query = query.eq("audience_type", opts.audience);
      if (opts.category !== "ALL") query = query.eq("category", opts.category);
      if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
      const { data, error, count } = await query;
      if (error) throw new Error("We couldn't load notices. Please try again.");
      return { rows: await toNotices(data ?? []), total: count ?? 0 };
    },
  });
}

/** Notices still waiting to go out, soonest first. */
export function useUpcomingNotices(propertyId: string, limit = 5) {
  return useQuery({
    queryKey: ["property-notices", propertyId, "upcoming", limit],
    queryFn: async (): Promise<{ rows: PropertyNotice[]; total: number }> => {
      const { data, error, count } = await supabase
        .from("notices")
        .select("*", { count: "exact" })
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .in("status", PENDING)
        .or(notLapsed(new Date().toISOString()))
        .order("publish_at", { ascending: true, nullsFirst: false })
        .limit(limit);
      if (error) throw new Error("We couldn't load upcoming notices.");
      return { rows: await toNotices(data ?? []), total: count ?? 0 };
    },
  });
}

/** The property's default broadcast channels (properties.settings.notice_default_channels). */
export function usePropertyNoticeDefaults(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["property-notice-defaults", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("settings")
        .eq("id", propertyId ?? "")
        .maybeSingle();
      if (error) throw new Error("We couldn't load the default channels.");
      return readNoticeDefaultChannels(data?.settings ?? null);
    },
  });
}

/**
 * Which channels can really deliver right now, asked of the server (which asks the sender). Same cache
 * entry as the Notice Composer. In-app never depends on a provider.
 */
export function useNoticeChannelAvailability(tenantId: string | null | undefined) {
  const fn = useServerFn(getNoticeChannelAvailability);
  return useQuery({
    queryKey: ["notice-channel-availability", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: () => fn({ data: { tenant_id: tenantId ?? "" } }),
  });
}

export function channelAvailability(
  q: ReturnType<typeof useNoticeChannelAvailability>,
  channel: NoticeChannelKey,
): { enabled: boolean; reason: string | null } {
  if (channel === "IN_APP") return { enabled: true, reason: null };
  if (q.isPending) return { enabled: false, reason: "Checking provider status…" };
  const a = q.data?.[channel];
  if (!a) return { enabled: false, reason: "Could not verify provider status" };
  return {
    enabled: a.available,
    reason: a.available ? null : (a.reason ?? "Provider not configured"),
  };
}
