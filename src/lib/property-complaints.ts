import { useEffect, useId } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { listStaff } from "@/lib/admin-staff.functions";
import { OPEN_COMPLAINT_STATUSES, type ComplaintWithRelations } from "@/lib/complaint";
import { BED_HOLDING } from "@/lib/rooms-beds";
import type { ComplaintPriority } from "@/schemas/complaint";

/**
 * Data for a property's Complaints tab. Plain RLS reads of `v_complaints_feed` (which masks an
 * anonymous complaint's student at the database), paged and filtered in the database; writes go
 * through `property-complaints.functions.ts`.
 */

export type PropertyComplaint = ComplaintWithRelations;

export const COMPLAINT_PAGE = 8;

export const STATUS_FILTERS = [
  "ALL",
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Statuses behind each chip / Kanban column. "Open" = not picked up yet (new, reopened, or the
 * legacy waiting-for-student status), so every complaint sits in exactly one group.
 */
const STATUS_GROUPS: Record<Exclude<StatusFilter, "ALL">, string[]> = {
  OPEN: ["OPEN", "REOPENED", "WAITING_FOR_STUDENT"],
  ASSIGNED: ["ASSIGNED"],
  IN_PROGRESS: ["IN_PROGRESS"],
  RESOLVED: ["RESOLVED"],
  CLOSED: ["CLOSED"],
};

export const SORTS = ["NEWEST", "OLDEST", "PRIORITY", "SLA"] as const;
export type ComplaintSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<ComplaintSort, string> = {
  NEWEST: "Raised time (newest)",
  OLDEST: "Raised time (oldest)",
  PRIORITY: "Priority (urgent first)",
  SLA: "SLA due (soonest)",
};

const PRIORITY_ORDER: ComplaintPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const QUEUE_PRIORITIES = ["URGENT", "HIGH"];

export interface ComplaintFilters {
  propertyId: string;
  status: StatusFilter;
  /** Category id or "ALL". */
  categoryId: string;
  /** Block id, "none" (no block) or "ALL". */
  blockId: string;
  q: string;
  /** Priority queue view: open URGENT / HIGH complaints only. */
  urgentOnly: boolean;
}

const FEED_COLUMNS =
  "id, tenant_id, property_id, block_id, room_id, bed_id, student_id, category_id, complaint_number, title, description, priority, status, assigned_to, assigned_at, sla_due_at, sla_breached_at, resolved_at, resolved_by, closed_at, resolution_summary, rating, rating_comment, reopen_until, is_anonymous, created_at, updated_at, student_full_name, student_admission_number, student_profile_id, student_avatar_path, room_number, block_name, category_name";

function feedQuery(f: ComplaintFilters, head = false) {
  let q = supabase
    .from("v_complaints_feed")
    .select(FEED_COLUMNS, { count: "exact", head })
    .eq("property_id", f.propertyId);
  if (f.status !== "ALL") q = q.in("status", [...STATUS_GROUPS[f.status]]);
  if (f.urgentOnly) {
    q = q.in("status", [...OPEN_COMPLAINT_STATUSES]).in("priority", [...QUEUE_PRIORITIES]);
  }
  if (f.categoryId !== "ALL") q = q.eq("category_id", f.categoryId);
  if (f.blockId === "none") q = q.is("block_id", null);
  else if (f.blockId !== "ALL") q = q.eq("block_id", f.blockId);
  // PostgREST's or() treats , ( ) as separators — keep them out of the term.
  const term = f.q.replace(/[,()*%\\]/g, " ").trim();
  if (term) {
    q = q.or(
      [
        `complaint_number.ilike.%${term}%`,
        `title.ilike.%${term}%`,
        `student_full_name.ilike.%${term}%`,
        `room_number.ilike.%${term}%`,
      ].join(","),
    );
  }
  return q;
}

const loadError = () => new Error("We couldn't load complaints. Please try again.");

/**
 * Rows `from`..`from + size - 1` of the filtered list in the chosen order. Priority is stored as
 * text, so "urgent first" is read bucket by bucket (counted first) to keep paging in the database.
 */
async function fetchComplaintsRange(
  f: ComplaintFilters,
  sort: ComplaintSort,
  from: number,
  size: number,
): Promise<{ rows: PropertyComplaint[]; total: number }> {
  if (sort !== "PRIORITY") {
    let q = feedQuery(f);
    if (sort === "SLA") q = q.order("sla_due_at", { ascending: true });
    q = q.order("created_at", { ascending: sort === "OLDEST" }).order("id");
    const { data, error, count } = await q.range(from, from + size - 1);
    if (error) throw loadError();
    return { rows: (data ?? []) as unknown as PropertyComplaint[], total: count ?? 0 };
  }

  const counts = await Promise.all(PRIORITY_ORDER.map((p) => feedQuery(f, true).eq("priority", p)));
  if (counts.some((c) => c.error)) throw loadError();
  const sizes = counts.map((c) => c.count ?? 0);
  const total = sizes.reduce((a, b) => a + b, 0);
  const rows: PropertyComplaint[] = [];
  let skip = from;
  let need = size;
  for (let i = 0; i < PRIORITY_ORDER.length && need > 0; i++) {
    const bucket = sizes[i] ?? 0;
    if (skip >= bucket) {
      skip -= bucket;
      continue;
    }
    const take = Math.min(need, bucket - skip);
    const { data, error } = await feedQuery(f)
      .eq("priority", PRIORITY_ORDER[i] ?? "LOW")
      .order("sla_due_at", { ascending: true })
      .order("created_at", { ascending: false })
      .order("id")
      .range(skip, skip + take - 1);
    if (error) throw loadError();
    rows.push(...((data ?? []) as unknown as PropertyComplaint[]));
    need -= take;
    skip = 0;
  }
  return { rows, total };
}

export function usePropertyComplaintsPage(
  f: ComplaintFilters,
  sort: ComplaintSort,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["property-complaints", f.propertyId, "list", f, sort, page],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => fetchComplaintsRange(f, sort, page * COMPLAINT_PAGE, COMPLAINT_PAGE),
  });
}

/** One Kanban column: the first `limit` complaints of a status group ("Load more" raises it). */
export function useKanbanColumn(
  f: ComplaintFilters,
  group: Exclude<StatusFilter, "ALL">,
  sort: ComplaintSort,
  limit: number,
) {
  const scoped = { ...f, status: group };
  return useQuery({
    queryKey: ["property-complaints", f.propertyId, "kanban", scoped, sort, limit],
    placeholderData: keepPreviousData,
    queryFn: () => fetchComplaintsRange(scoped, sort, 0, limit),
  });
}

/** Every row of the filtered list (for CSV export), 1000 at a time, capped at 20,000. */
export async function fetchAllComplaints(f: ComplaintFilters, sort: ComplaintSort) {
  const out: PropertyComplaint[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { rows, total } = await fetchComplaintsRange(f, sort, from, 1000);
    out.push(...rows);
    if (rows.length < 1000 || out.length >= total) break;
  }
  return out;
}

/** Monday 00:00 India time (the app's business zone) of the current week. */
function weekStartIso(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const back = (ist.getUTCDay() + 6) % 7;
  const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - back);
  return new Date(start - 330 * 60_000).toISOString();
}

export interface ComplaintStats {
  /** Everything short of resolved / closed / cancelled (the app-wide "open" definition). */
  unresolved: number;
  inProgress: number;
  resolvedThisWeek: number;
  slaBreached: number;
  groups: Record<Exclude<StatusFilter, "ALL">, number>;
}

export function useComplaintStats(propertyId: string) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "stats"],
    queryFn: async (): Promise<ComplaintStats> => {
      const base = () =>
        supabase
          .from("complaints")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .is("deleted_at", null);
      const nowIso = new Date().toISOString();
      const res = await Promise.all([
        base().in("status", [...OPEN_COMPLAINT_STATUSES]),
        base().in("status", ["RESOLVED", "CLOSED"]).gte("resolved_at", weekStartIso()),
        base()
          .in("status", [...OPEN_COMPLAINT_STATUSES])
          .or(`sla_breached_at.not.is.null,sla_due_at.lt."${nowIso}"`),
        base().in("status", STATUS_GROUPS.OPEN),
        base().in("status", STATUS_GROUPS.ASSIGNED),
        base().in("status", STATUS_GROUPS.IN_PROGRESS),
        base().in("status", STATUS_GROUPS.RESOLVED),
        base().in("status", STATUS_GROUPS.CLOSED),
      ]);
      if (res.some((r) => r.error)) {
        throw new Error("We couldn't load the complaint numbers. Please try again.");
      }
      const [
        unresolved,
        resolvedThisWeek,
        slaBreached,
        open,
        assigned,
        inProgress,
        resolved,
        closed,
      ] = res.map((r) => r.count ?? 0);
      return {
        unresolved: unresolved ?? 0,
        inProgress: inProgress ?? 0,
        resolvedThisWeek: resolvedThisWeek ?? 0,
        slaBreached: slaBreached ?? 0,
        groups: {
          OPEN: open ?? 0,
          ASSIGNED: assigned ?? 0,
          IN_PROGRESS: inProgress ?? 0,
          RESOLVED: resolved ?? 0,
          CLOSED: closed ?? 0,
        },
      };
    },
  });
}

/** Open URGENT / HIGH complaints, soonest SLA first. */
export function usePriorityQueue(propertyId: string) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "priority-queue"],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("v_complaints_feed")
        .select(FEED_COLUMNS, { count: "exact" })
        .eq("property_id", propertyId)
        .in("status", [...OPEN_COMPLAINT_STATUSES])
        .in("priority", QUEUE_PRIORITIES)
        .order("sla_due_at", { ascending: true })
        .limit(4);
      if (error) throw new Error("We couldn't load the priority queue. Please try again.");
      return { rows: (data ?? []) as unknown as PropertyComplaint[], total: count ?? 0 };
    },
  });
}

export type ComplaintEventKind = "CREATED" | "ASSIGNED" | "RESOLVED" | "REOPENED" | "COMMENT";

interface ComplaintEvent {
  key: string;
  at: string;
  kind: ComplaintEventKind;
  complaintId: string;
  number: string;
  title: string;
  /** Student (null when anonymous), comment author, or nothing. */
  who: string | null;
  /** Warden user id for ASSIGNED events. */
  assignee: string | null;
  detail: string | null;
}

interface CommentRow {
  id: string;
  complaint_id: string;
  body: string;
  created_at: string;
  author_full_name: string | null;
  is_anonymous_author: boolean | null;
}

/**
 * Recent complaint activity rebuilt from the complaints' own timestamps (audit logs are not
 * readable from the browser): raised, assigned, resolved, reopened and conversation messages.
 */
export function useComplaintActivity(propertyId: string) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "activity"],
    queryFn: async (): Promise<ComplaintEvent[]> => {
      const LIMIT = 12;
      const feed = () =>
        supabase
          .from("v_complaints_feed")
          .select(
            "id, complaint_number, title, student_full_name, assigned_to, assigned_at, resolved_at, resolution_summary, created_at",
          )
          .eq("property_id", propertyId);
      const [created, assigned, resolved, reopened, comments] = await Promise.all([
        feed().order("created_at", { ascending: false }).limit(LIMIT),
        feed()
          .not("assigned_at", "is", null)
          .not("assigned_to", "is", null)
          .order("assigned_at", { ascending: false })
          .limit(LIMIT),
        feed()
          .not("resolved_at", "is", null)
          .order("resolved_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("complaints")
          .select("id, complaint_number, title, reopened_at")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .not("reopened_at", "is", null)
          .order("reopened_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("v_complaint_comments_feed")
          .select("id, complaint_id, body, created_at, author_full_name, is_anonymous_author")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(LIMIT),
      ]);
      if (created.error || assigned.error || resolved.error || reopened.error) {
        throw new Error("We couldn't load complaint activity. Please try again.");
      }

      const events: ComplaintEvent[] = [];
      const known = new Map<string, { number: string; title: string }>();
      for (const c of created.data ?? []) {
        if (!c.id || !c.created_at) continue;
        known.set(c.id, { number: c.complaint_number ?? "", title: c.title ?? "" });
        events.push({
          key: `new-${c.id}`,
          at: c.created_at,
          kind: "CREATED",
          complaintId: c.id,
          number: c.complaint_number ?? "",
          title: c.title ?? "",
          who: c.student_full_name,
          assignee: null,
          detail: null,
        });
      }
      for (const c of assigned.data ?? []) {
        if (!c.id || !c.assigned_at) continue;
        known.set(c.id, { number: c.complaint_number ?? "", title: c.title ?? "" });
        events.push({
          key: `asg-${c.id}`,
          at: c.assigned_at,
          kind: "ASSIGNED",
          complaintId: c.id,
          number: c.complaint_number ?? "",
          title: c.title ?? "",
          who: null,
          assignee: c.assigned_to,
          detail: null,
        });
      }
      for (const c of resolved.data ?? []) {
        if (!c.id || !c.resolved_at) continue;
        known.set(c.id, { number: c.complaint_number ?? "", title: c.title ?? "" });
        events.push({
          key: `res-${c.id}`,
          at: c.resolved_at,
          kind: "RESOLVED",
          complaintId: c.id,
          number: c.complaint_number ?? "",
          title: c.title ?? "",
          who: null,
          assignee: null,
          detail: c.resolution_summary,
        });
      }
      for (const c of reopened.data ?? []) {
        if (!c.reopened_at) continue;
        known.set(c.id, { number: c.complaint_number, title: c.title });
        events.push({
          key: `rop-${c.id}-${c.reopened_at}`,
          at: c.reopened_at,
          kind: "REOPENED",
          complaintId: c.id,
          number: c.complaint_number,
          title: c.title,
          who: null,
          assignee: null,
          detail: null,
        });
      }

      // Messages: a failure here just leaves them out.
      const msgs = comments.error ? [] : ((comments.data ?? []) as unknown as CommentRow[]);
      const missing = Array.from(
        new Set(msgs.map((m) => m.complaint_id).filter((id) => !known.has(id))),
      );
      if (missing.length) {
        const { data } = await supabase
          .from("v_complaints_feed")
          .select("id, complaint_number, title")
          .in("id", missing);
        for (const c of data ?? []) {
          if (c.id) known.set(c.id, { number: c.complaint_number ?? "", title: c.title ?? "" });
        }
      }
      for (const m of msgs) {
        const c = known.get(m.complaint_id);
        if (!c) continue;
        // The override's history message duplicates its own "Reopened" event.
        if (m.body.startsWith("Reopened by Admin override")) continue;
        events.push({
          key: `msg-${m.id}`,
          at: m.created_at,
          kind: "COMMENT",
          complaintId: m.complaint_id,
          number: c.number,
          title: c.title,
          who: m.is_anonymous_author ? "Anonymous student" : m.author_full_name,
          assignee: null,
          detail: m.body,
        });
      }

      return events
        .filter((e) => !Number.isNaN(new Date(e.at).getTime()))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 20);
    },
  });
}

/** Refetch this property's complaint queries whenever one of its complaints changes. */
export function useComplaintsRealtime(propertyId: string) {
  const qc = useQueryClient();
  const instanceId = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`property-complaints-${propertyId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `property_id=eq.${propertyId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["property-complaints", propertyId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, qc, instanceId]);
}

// ---------------------------------------------------------------------------
// Lookups for filters and the New / Edit complaint dialog
// ---------------------------------------------------------------------------

export function usePropertyBlocks(propertyId: string) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "blocks"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("id, name")
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("display_order")
        .order("name");
      if (error) throw new Error("We couldn't load blocks.");
      return data ?? [];
    },
  });
}

export function usePropertyRooms(propertyId: string, enabled = true) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "rooms"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, block_id")
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("room_number")
        .limit(5000);
      if (error) throw new Error("We couldn't load rooms.");
      return data ?? [];
    },
  });
}

export function useRoomBeds(roomId: string | null) {
  return useQuery({
    queryKey: ["property-complaints", "beds", roomId],
    enabled: !!roomId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select("id, code")
        .eq("room_id", roomId ?? "")
        .is("deleted_at", null)
        .order("code");
      if (error) throw new Error("We couldn't load beds.");
      return data ?? [];
    },
  });
}

export interface ResidentOption {
  id: string;
  full_name: string;
  admission_number: string;
  status: string;
  /** Current bed-holding allocation, used as the complaint's default room / bed. */
  stay: { room_id: string; bed_id: string; room: string | null; bed: string | null } | null;
}

const RESIDENT_SELECT =
  "id, full_name, admission_number, status, allocations(room_id, bed_id, status, deleted_at, created_at, rooms(room_number), beds(code))";

type ResidentRowRaw = {
  id: string;
  full_name: string;
  admission_number: string;
  status: string;
  allocations: {
    room_id: string;
    bed_id: string;
    status: string;
    deleted_at: string | null;
    created_at: string;
    rooms: { room_number: string } | null;
    beds: { code: string } | null;
  }[];
};

function toResident(s: ResidentRowRaw): ResidentOption {
  const live = (s.allocations ?? [])
    .filter((a) => !a.deleted_at && BED_HOLDING.includes(a.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    id: s.id,
    full_name: s.full_name,
    admission_number: s.admission_number,
    status: s.status,
    stay: live
      ? {
          room_id: live.room_id,
          bed_id: live.bed_id,
          room: live.rooms?.room_number ?? null,
          bed: live.beds?.code ?? null,
        }
      : null,
  };
}

/** This property's residents matching a name / admission number (20 at a time). */
export function useResidentSearch(propertyId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "resident-search", q],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ResidentOption[]> => {
      const term = q.replace(/[,()*%\\]/g, " ").trim();
      let query = supabase
        .from("students")
        .select(RESIDENT_SELECT)
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("full_name")
        .limit(20);
      if (term) {
        query = query.or(`full_name.ilike.%${term}%,admission_number.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw new Error("We couldn't search residents.");
      return ((data ?? []) as unknown as ResidentRowRaw[]).map(toResident);
    },
  });
}

export function useResident(propertyId: string, studentId: string | null) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "resident", studentId],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async (): Promise<ResidentOption | null> => {
      const { data, error } = await supabase
        .from("students")
        .select(RESIDENT_SELECT)
        .eq("id", studentId ?? "")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw new Error("We couldn't load the student.");
      return data ? toResident(data as unknown as ResidentRowRaw) : null;
    },
  });
}

type StaffRow = Awaited<ReturnType<typeof listStaff>>[number];
export interface WardenOption {
  user_id: string;
  name: string;
  block_id: string | null;
}

/**
 * This property's active wardens who may handle complaints (an explicitly revoked `complaints`
 * permission excludes them, matching can_manage_complaints()). Also the name lookup for the
 * activity feed and CSV export.
 */
export function usePropertyWardens(tenantId: string, propertyId: string) {
  const listStaffFn = useServerFn(listStaff);
  return useQuery({
    queryKey: ["property-complaints", propertyId, "wardens", tenantId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows: StaffRow[] = await listStaffFn({
        data: { tenant_id: tenantId, property_id: propertyId },
      });
      const all = rows.filter((s) => s.role === "WARDEN");
      const names = new Map<string, string>();
      for (const s of all) {
        names.set(
          s.user_id,
          s.profile?.full_name ?? s.profile?.email ?? s.profile?.phone ?? "Unnamed warden",
        );
      }
      const assignable: WardenOption[] = all
        .filter(
          (s) =>
            s.is_active && (s.permissions as Record<string, boolean> | null)?.complaints !== false,
        )
        .map((s) => ({
          user_id: s.user_id,
          name: names.get(s.user_id) ?? "Unnamed warden",
          block_id: s.block_id,
        }));
      return { assignable, names };
    },
  });
}

/** Wardens who cover a complaint in `blockId` (same filter as the Admin complaints page). */
export function wardensForBlock(list: WardenOption[], blockId: string | null) {
  const seen = new Set<string>();
  return list.filter((w) => {
    if (w.block_id && w.block_id !== blockId) return false;
    if (seen.has(w.user_id)) return false;
    seen.add(w.user_id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hrem = h % 24;
  return hrem ? `${d}d ${hrem}h` : `${d}d`;
}

export type SlaTone = "ok" | "warn" | "breach" | "done" | "muted";

/** "SLA in 1h 20m" / "Breached 35m ago" / "Resolved" for a complaint row. */
export function complaintSla(
  c: Pick<PropertyComplaint, "status" | "sla_due_at" | "sla_breached_at">,
  now = Date.now(),
): { tone: SlaTone; label: string } {
  if (c.status === "RESOLVED") return { tone: "done", label: "Resolved" };
  if (c.status === "CLOSED") return { tone: "done", label: "Closed" };
  if (c.status === "CANCELLED") return { tone: "muted", label: "Cancelled" };
  const dueMin = (new Date(c.sla_due_at).getTime() - now) / 60_000;
  if (c.sla_breached_at || dueMin < 0) {
    return { tone: "breach", label: `Breached ${formatDuration(-dueMin)} ago` };
  }
  return { tone: dueMin < 60 ? "warn" : "ok", label: `SLA in ${formatDuration(dueMin)}` };
}

/** ISO → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
}

/** <input type="datetime-local"> value → ISO, or null when empty / invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatRaised(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How many complaints match the filters (Kanban header). */
export function useComplaintCount(f: ComplaintFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["property-complaints", f.propertyId, "count", f],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { count, error } = await feedQuery(f, true);
      if (error) throw loadError();
      return count ?? 0;
    },
  });
}

/**
 * Status chip counts for the current search / category / block / urgent filters (the status
 * chip itself is ignored, so every chip shows its own number): one head count per group plus
 * "All", which matches the list's total when no status chip is picked.
 */
export function useComplaintGroupCounts(f: ComplaintFilters) {
  const base: ComplaintFilters = { ...f, status: "ALL" };
  return useQuery({
    queryKey: ["property-complaints", f.propertyId, "group-counts", base],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<StatusFilter, number>> => {
      const res = await Promise.all(
        STATUS_FILTERS.map((s) => feedQuery({ ...base, status: s }, true)),
      );
      if (res.some((r) => r.error)) throw loadError();
      const n = (s: StatusFilter) => res[STATUS_FILTERS.indexOf(s)]?.count ?? 0;
      return {
        ALL: n("ALL"),
        OPEN: n("OPEN"),
        ASSIGNED: n("ASSIGNED"),
        IN_PROGRESS: n("IN_PROGRESS"),
        RESOLVED: n("RESOLVED"),
        CLOSED: n("CLOSED"),
      };
    },
  });
}

/** Open complaints for the Assign warden quick action (search by number / title / student). */
export function useAssignableComplaints(
  propertyId: string,
  q: string,
  unassignedOnly: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["property-complaints", propertyId, "assignable", q, unassignedOnly],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = feedQuery({
        propertyId,
        status: "ALL",
        categoryId: "ALL",
        blockId: "ALL",
        q,
        urgentOnly: false,
      })
        .in("status", [...OPEN_COMPLAINT_STATUSES])
        .order("created_at", { ascending: false })
        .limit(20);
      if (unassignedOnly) query = query.is("assigned_to", null);
      const { data, error } = await query;
      if (error) throw loadError();
      return (data ?? []) as unknown as PropertyComplaint[];
    },
  });
}
