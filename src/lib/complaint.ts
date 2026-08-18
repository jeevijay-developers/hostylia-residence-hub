import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["complaint_categories"]["Row"];
export type ComplaintCommentRow = Database["public"]["Tables"]["complaint_comments"]["Row"];

/** Complaint row enriched with the joined student/room/block/category info the Warden page displays. */
export type ComplaintWithRelations = ComplaintRow & {
  students: {
    full_name: string;
    admission_number: string;
    profile_id: string;
    profiles: { avatar_path: string | null } | null;
  } | null;
  rooms: { room_number: string } | null;
  blocks: { name: string } | null;
  complaint_categories: { name: string } | null;
};

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
  const key = ["complaints", opts];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("complaints")
        .select(
          "id, tenant_id, property_id, block_id, room_id, bed_id, student_id, category_id, complaint_number, title, description, priority, status, assigned_to, assigned_at, sla_due_at, sla_breached_at, resolved_at, resolved_by, closed_at, resolution_summary, rating, rating_comment, reopen_until, created_at, updated_at, students(full_name, admission_number, profile_id, profiles(avatar_path)), rooms(room_number), blocks(name), complaint_categories(name)",
        )
        .is("deleted_at", null)
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
      .channel(`complaints-${opts.propertyId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints", filter }, () =>
        qc.invalidateQueries({ queryKey: ["complaints"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.propertyId, qc]);

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
        .from("complaints")
        .select(
          "id, tenant_id, property_id, block_id, room_id, bed_id, student_id, category_id, complaint_number, title, description, priority, status, assigned_to, assigned_at, sla_due_at, sla_breached_at, resolved_at, resolved_by, closed_at, resolution_summary, rating, rating_comment, reopen_until, created_at, updated_at, students(full_name, admission_number, profile_id, profiles(avatar_path)), rooms(room_number), blocks(name), complaint_categories(name)",
          { count: "exact" },
        )
        .is("deleted_at", null)
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

export type ComplaintCommentWithAuthor = ComplaintCommentRow & {
  profiles: { full_name: string } | null;
};

export function useComplaintComments(complaintId: string | null) {
  return useQuery({
    queryKey: ["complaint-comments", complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaint_comments")
        .select(
          "id, tenant_id, property_id, complaint_id, author_user_id, body, created_at, profiles(full_name)",
        )
        .eq("complaint_id", complaintId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ComplaintCommentWithAuthor[];
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
