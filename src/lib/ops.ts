// Phase 11A — client hooks for operations (attendance, gate, mess, visitors).
import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AttendanceRow = Database["public"]["Tables"]["attendance"]["Row"];
export type GatePassRow = Database["public"]["Tables"]["gate_passes"]["Row"];
export type GateEventRow = Database["public"]["Tables"]["gate_events"]["Row"];
export type VisitorRow = Database["public"]["Tables"]["visitors"]["Row"];
export type MessMenuRow = Database["public"]["Tables"]["mess_menus"]["Row"];
export type MessMenuItemRow = Database["public"]["Tables"]["mess_menu_items"]["Row"];
export type MessFeedbackRow = Database["public"]["Tables"]["mess_feedback"]["Row"];
export type MessHeadcountRow = Database["public"]["Tables"]["mess_headcounts"]["Row"];

export function useAttendance(propertyId: string | null, date: string) {
  return useQuery({
    queryKey: ["attendance", propertyId, date],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("property_id", propertyId!)
        .eq("attendance_date", date);
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });
}

export function useStudentsInProperty(propertyId: string | null) {
  return useQuery({
    queryKey: ["students-in-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_number, photo_path, status, allocations(status, room_id, block_id, beds(code), rooms(room_number), blocks(name))",
        )
        .eq("property_id", propertyId!)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGatePasses(propertyId: string | null, statuses?: string[]) {
  const qc = useQueryClient();
  // warden.gate.tsx calls this hook twice for the same propertyId (once for
  // "pending", once for "active") — a channel name keyed only on propertyId
  // collides between the two, and Supabase throws "cannot add
  // postgres_changes callbacks... after subscribe()" on the second .on()
  // call against the already-subscribed shared channel. useId() guarantees
  // every hook instance gets its own channel regardless of how many times
  // (or with what filters) it's mounted concurrently.
  const instanceId = useId();
  const q = useQuery({
    queryKey: ["gate-passes", propertyId, statuses?.join(",") ?? ""],
    enabled: !!propertyId,
    queryFn: async () => {
      let query = supabase
        .from("gate_passes")
        .select("*, students(full_name, allocations(status, rooms(room_number)))")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statuses?.length) query = query.in("status", statuses);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!propertyId) return;
    const ch = supabase
      .channel(`gp-${propertyId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gate_passes",
          filter: `property_id=eq.${propertyId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["gate-passes"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [propertyId, qc, instanceId]);
  return q;
}

export function useGateEventsFeed(propertyId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["gate-events", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_events")
        .select("*, students(full_name), visitors(name)")
        .eq("property_id", propertyId!)
        .order("event_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!propertyId) return;
    const ch = supabase
      .channel(`ge-${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gate_events",
          filter: `property_id=eq.${propertyId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["gate-events"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [propertyId, qc]);
  return q;
}

export function useMessMenusForDate(propertyId: string | null, date: string) {
  return useQuery({
    queryKey: ["mess-menus", propertyId, date],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mess_menus")
        .select("*, mess_menu_items(*), mess_headcounts(*)")
        .eq("property_id", propertyId!)
        .eq("menu_date", date)
        .order("meal");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVisitors(propertyId: string | null) {
  return useQuery({
    queryKey: ["visitors", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitors")
        .select("*, students(full_name, allocations(status, rooms(room_number)))")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
