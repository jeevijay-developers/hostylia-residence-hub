import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["complaint_categories"]["Row"];

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
          "id, tenant_id, property_id, block_id, room_id, bed_id, student_id, category_id, complaint_number, title, description, priority, status, assigned_to, assigned_at, sla_due_at, sla_breached_at, resolved_at, closed_at, resolution_summary, rating, rating_comment, reopen_until, created_at, updated_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (opts.studentId) q = q.eq("student_id", opts.studentId);
      if (opts.propertyId) q = q.eq("property_id", opts.propertyId);
      if (opts.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ComplaintRow[];
    },
  });

  // Realtime — refetch on any change scoped by property
  useEffect(() => {
    const filter = opts.propertyId ? `property_id=eq.${opts.propertyId}` : undefined;
    const channel = supabase
      .channel(`complaints-${opts.propertyId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter },
        () => qc.invalidateQueries({ queryKey: ["complaints"] }),
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

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hrem = h % 24;
  return hrem ? `${d}d ${hrem}h` : `${d}d`;
}
