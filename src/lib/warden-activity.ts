import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAttendance, useMessMenusForDate } from "@/lib/ops";
import { useComplaints } from "@/lib/complaint";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityItem {
  type: string;
  detail: string;
  at: string;
}

/**
 * Today's warden activity feed — attendance submissions, complaint
 * updates/resolutions, gate pass approvals, and menu publishes — shared by
 * the daily-brief summary card (sliced to a handful) and the full
 * /warden/activity page (unsliced) so both stay in sync off one assembly.
 */
export function useRecentActivity(propertyId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const attendanceQ = useAttendance(propertyId, today);
  const complaintsQ = useComplaints({ propertyId });
  const menusQ = useMessMenusForDate(propertyId, today);

  const approvedTodayQ = useQuery({
    queryKey: ["gate-passes-approved-today", propertyId, today],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_passes")
        .select("id, pass_number, warden_approved_at, status")
        .eq("property_id", propertyId!)
        .eq("status", "APPROVED")
        .gte("warden_approved_at", `${today}T00:00:00`)
        .order("warden_approved_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    const attendanceGroups = new Map<string, number>();
    for (const a of attendanceQ.data ?? []) {
      attendanceGroups.set(a.marked_at, (attendanceGroups.get(a.marked_at) ?? 0) + 1);
    }
    for (const [at, count] of attendanceGroups) {
      list.push({
        type: "Attendance Submitted",
        detail: `${count} student${count === 1 ? "" : "s"} marked`,
        at,
      });
    }

    for (const c of complaintsQ.data ?? []) {
      const updatedToday = c.updated_at?.slice(0, 10) === today;
      const resolvedToday = c.status === "RESOLVED" && c.resolved_at?.slice(0, 10) === today;
      if (resolvedToday) {
        list.push({
          type: "Complaint Resolved",
          detail: `${c.complaint_number} — ${c.title}`,
          at: c.resolved_at!,
        });
      } else if (updatedToday) {
        list.push({
          type: "Complaint Updated",
          detail: `${c.complaint_number} — ${c.title}`,
          at: c.updated_at,
        });
      }
    }

    for (const g of approvedTodayQ.data ?? []) {
      if (g.warden_approved_at) {
        list.push({ type: "Gate Pass Approved", detail: g.pass_number, at: g.warden_approved_at });
      }
    }

    for (const m of menusQ.data ?? []) {
      if (m.published_at) {
        list.push({
          type: "Menu Published",
          detail: `${m.meal}${m.title ? ` — ${m.title}` : ""}`,
          at: m.published_at,
        });
      }
    }

    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [attendanceQ.data, complaintsQ.data, approvedTodayQ.data, menusQ.data, today]);

  const isLoading =
    attendanceQ.isLoading || complaintsQ.isLoading || menusQ.isLoading || approvedTodayQ.isLoading;

  return { items, isLoading };
}
