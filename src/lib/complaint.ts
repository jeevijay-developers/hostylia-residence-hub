import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["complaint_categories"]["Row"];

/**
 * Complaint row enriched with student/room/block/category display info via
 * `v_complaints_feed` (see the 20260819120000 migration) instead of raw
 * embedded joins — the view masks `student_*` fields to null at the database
 * level when `is_anonymous` is true, so an anonymous student's identity is
 * never sent to Admin/Warden clients in the first place, not just hidden in
 * the UI. Declared as `ComplaintRow &` (rather than the view's own row type)
 * so this stays a drop-in for components typed against the base complaint
 * shape (e.g. RatingWidget, ComplaintTimeline); the view's select list omits
 * `created_by`/`deleted_at`/`deleted_by`, which those components don't read.
 */
export type ComplaintWithRelations = ComplaintRow & {
  is_anonymous: boolean;
  student_full_name: string | null;
  student_admission_number: string | null;
  student_profile_id: string | null;
  student_avatar_path: string | null;
  room_number: string | null;
  block_name: string | null;
  category_name: string | null;
};

const COMPLAINT_FEED_COLUMNS =
  "id, tenant_id, property_id, block_id, room_id, bed_id, student_id, category_id, complaint_number, title, description, priority, status, assigned_to, assigned_at, sla_due_at, sla_breached_at, resolved_at, resolved_by, closed_at, resolution_summary, rating, rating_comment, reopen_until, is_anonymous, created_at, updated_at, student_full_name, student_admission_number, student_profile_id, student_avatar_path, room_number, block_name, category_name";

/** Active allocation for the signed-in student, used to auto-fill room/bed/block. */
export function useStudentSelf() {
  return useQuery({
    queryKey: ["student-self"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: s } = await supabase
        .from("students")
        .select("id, tenant_id, property_id")
        .eq("profile_id", u.user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!s) return null;
      const { data: alloc } = await supabase
        .from("allocations")
        .select("id, bed_id, room_id, block_id, status")
        .eq("student_id", s.id)
        .is("deleted_at", null)
        .in("status", [
          "PENDING_AGREEMENT",
          "PENDING_PAYMENT",
          "ACTIVE",
          "NOTICE_GIVEN",
          "MOVE_OUT_INSPECTION",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...s, allocation: alloc ?? null };
    },
  });
}

export function useComplaintCategories(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["complaint-categories", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaint_categories")
        .select("*")
        .eq("property_id", propertyId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });
}

interface ListOptions {
  propertyId?: string | null;
  studentId?: string | null;
  assignedTo?: string | null;
  includeUnassignedInProperty?: boolean;
}

export function useComplaints(opts: ListOptions) {
  const qc = useQueryClient();
  // Multiple components can mount useComplaints with the same propertyId at
  // once (e.g. the daily-brief page's own KPI query plus useRecentActivity's
  // internal one) — a channel name keyed only on propertyId collides between
  // instances and Supabase throws "cannot add postgres_changes callbacks...
  // after subscribe()" on the second .on() call against the already-
  // subscribed shared channel. Same fix as useGatePasses in ops.ts.
  const instanceId = useId();
  const key = ["complaints", opts];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("v_complaints_feed")
        .select(COMPLAINT_FEED_COLUMNS)
        .order("created_at", { ascending: false });
      if (opts.studentId) q = q.eq("student_id", opts.studentId);
      if (opts.propertyId) q = q.eq("property_id", opts.propertyId);
      if (opts.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ComplaintWithRelations[];
    },
  });

  // Realtime — refetch on any change scoped by property
  useEffect(() => {
    const filter = opts.propertyId ? `property_id=eq.${opts.propertyId}` : undefined;
    const channel = supabase
      .channel(`complaints-${opts.propertyId ?? "all"}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints", filter }, () =>
        qc.invalidateQueries({ queryKey: ["complaints"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.propertyId, qc, instanceId]);

  return query;
}

interface PagedListOptions extends ListOptions {
  status?: string | null;
  categoryId?: string | null;
  blockId?: string | null;
  page: number;
  pageSize: number;
}

/**
 * Server-paginated variant for the Admin Complaints table specifically —
 * that page can realistically grow into the hundreds/thousands per property
 * over time, unlike `useComplaints`' other (bounded) consumers (a single
 * student's own complaints, a dashboard's recent-complaints widget), which
 * stay on the unpaginated hook above unchanged.
 */
export function useComplaintsPaged(opts: PagedListOptions) {
  const qc = useQueryClient();
  const key = ["complaints-paged", opts];
  const query = useQuery({
    queryKey: key,
    enabled: !!opts.propertyId,
    queryFn: async () => {
      let q = supabase
        .from("v_complaints_feed")
        .select(COMPLAINT_FEED_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(opts.page * opts.pageSize, opts.page * opts.pageSize + opts.pageSize - 1);
      if (opts.studentId) q = q.eq("student_id", opts.studentId);
      if (opts.propertyId) q = q.eq("property_id", opts.propertyId);
      if (opts.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
      if (opts.status) q = q.eq("status", opts.status);
      if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
      if (opts.blockId) {
        if (opts.blockId === "none") q = q.is("block_id", null);
        else q = q.eq("block_id", opts.blockId);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ComplaintWithRelations[], total: count ?? 0 };
    },
  });

  useEffect(() => {
    const filter = opts.propertyId ? `property_id=eq.${opts.propertyId}` : undefined;
    const channel = supabase
      .channel(`complaints-paged-${opts.propertyId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints", filter }, () =>
        qc.invalidateQueries({ queryKey: ["complaints-paged"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.propertyId, qc]);

  return query;
}

/** SLA countdown metadata for display. Never returns brand colors — status only. */
export function slaMeta(c: ComplaintRow): {
  label: string;
  tone: "ok" | "warn" | "breach" | "done";
} {
  if (["RESOLVED", "CLOSED", "CANCELLED"].includes(c.status)) {
    return { label: "Closed", tone: "done" };
  }
  const dueMs = new Date(c.sla_due_at).getTime() - Date.now();
  if (c.sla_breached_at || dueMs < 0) {
    const overdueMin = Math.round(-dueMs / 60000);
    return {
      label: `SLA breached ${formatMinutes(overdueMin)} ago`,
      tone: "breach",
    };
  }
  const mins = Math.round(dueMs / 60000);
  const tone = mins < 60 ? "warn" : "ok";
  return { label: `SLA in ${formatMinutes(mins)}`, tone };
}

export type ComplaintCommentWithAuthor =
  Database["public"]["Views"]["v_complaint_comments_feed"]["Row"];

/**
 * Reads from `v_complaint_comments_feed` (see the 20260819120000 migration)
 * rather than the base `complaint_comments` table joined to `profiles`
 * client-side: besides sidestepping the missing-FK embedding issue that join
 * had, the view also nulls out `author_full_name` (and sets
 * `is_anonymous_author`) at the database level when the author is the
 * student on an anonymous complaint — so their name is never sent to the
 * client for masking, not just hidden in the UI. Staff replies are never
 * masked.
 */
export function useComplaintComments(complaintId: string | null) {
  return useQuery({
    queryKey: ["complaint-comments", complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_complaint_comments_feed")
        .select(
          "id, tenant_id, property_id, complaint_id, author_user_id, body, created_at, is_anonymous_author, author_full_name",
        )
        .eq("complaint_id", complaintId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComplaintCommentWithAuthor[];
    },
  });
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hrem = h % 24;
  return hrem ? `${d}d ${hrem}h` : `${d}d`;
}
