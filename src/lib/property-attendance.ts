import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CircleDashed,
  Clock,
  DoorOpen,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";

import {
  getPropertyAttendanceToday,
  getPropertyAttendanceTrend,
  getTodayAttendanceRoster,
  type TodayStatus,
} from "@/lib/property-attendance.functions";
import { supabase } from "@/integrations/supabase/client";
import type { SemanticTone } from "@/lib/utils";

/**
 * Data for a property's Attendance tab. The work happens in
 * property-attendance.functions.ts (caller's RLS client, aggregated on the
 * server); see that file for every definition. Query keys live under
 * ["property-attendance", propertyId].
 */

export type { TodayStatus } from "@/lib/property-attendance.functions";
export type {
  AttendanceDayPoint,
  PropertyAttendanceToday,
} from "@/lib/property-attendance.functions";

export const ROSTER_PAGE = 8;

export type TrendRange = 7 | 30;
export const TREND_RANGES: { value: TrendRange; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
];

export const TODAY_STATUS_META: Record<
  TodayStatus,
  { label: string; icon: LucideIcon; tone: SemanticTone; fill: string; dot: string }
> = {
  PRESENT: {
    label: "Present",
    icon: UserCheck,
    tone: "success",
    fill: "var(--success)",
    dot: "bg-success",
  },
  ABSENT: {
    label: "Absent",
    icon: UserX,
    tone: "destructive",
    fill: "var(--destructive)",
    dot: "bg-destructive",
  },
  LATE: {
    label: "Late in",
    icon: Clock,
    tone: "warning",
    fill: "var(--warning)",
    dot: "bg-warning",
  },
  ON_LEAVE: {
    label: "On leave",
    icon: CalendarDays,
    tone: "info",
    fill: "var(--info)",
    dot: "bg-info",
  },
  OUT_PASS: {
    label: "Out-pass",
    icon: DoorOpen,
    tone: "primary",
    fill: "var(--primary)",
    dot: "bg-primary",
  },
  NOT_MARKED: {
    label: "Not marked",
    icon: CircleDashed,
    tone: "muted",
    fill: "var(--muted-foreground)",
    dot: "bg-muted-foreground",
  },
};

/** Order used by the status filter, donut legend and CSV export. */
export const TODAY_STATUS_ORDER: TodayStatus[] = [
  "PRESENT",
  "ABSENT",
  "ON_LEAVE",
  "LATE",
  "OUT_PASS",
  "NOT_MARKED",
];

export function usePropertyAttendanceToday(propertyId: string) {
  const fn = useServerFn(getPropertyAttendanceToday);
  return useQuery({
    queryKey: ["property-attendance", propertyId, "today"],
    staleTime: 30_000,
    queryFn: () => fn({ data: { property_id: propertyId } }),
  });
}

export function useAttendanceTrend(propertyId: string, days: TrendRange) {
  const fn = useServerFn(getPropertyAttendanceTrend);
  return useQuery({
    queryKey: ["property-attendance", propertyId, "trend", days],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fn({ data: { property_id: propertyId, days } }),
  });
}

interface RosterFilters {
  blockId: string | null;
  floorId: string | null;
  status: TodayStatus | null;
  q: string;
}

export function useTodayAttendanceRoster(propertyId: string, filters: RosterFilters, page: number) {
  const fn = useServerFn(getTodayAttendanceRoster);
  return useQuery({
    queryKey: [
      "property-attendance",
      propertyId,
      "roster",
      filters.blockId,
      filters.floorId,
      filters.status,
      filters.q,
      page,
    ],
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fn({
        data: {
          property_id: propertyId,
          block_id: filters.blockId,
          floor_id: filters.floorId,
          status: filters.status,
          q: filters.q,
          page,
          page_size: ROSTER_PAGE,
        },
      }),
  });
}

/** Roster server fn for the CSV export, which pages through every active resident. */
export function useTodayAttendanceExport() {
  return useServerFn(getTodayAttendanceRoster);
}

// leave_requests is not in the generated Database types yet (see src/lib/leave.ts),
// so the head-only count query is typed by hand.
interface LeaveCountQuery extends PromiseLike<{
  count: number | null;
  error: { message: string } | null;
}> {
  eq(column: string, value: string): LeaveCountQuery;
}
interface LeaveCountTable {
  select(columns: string, opts: { count: "exact"; head: true }): LeaveCountQuery;
}

/**
 * Exact number of PENDING leave requests in a property (RLS: staff scope), for
 * the "Manage leaves" badge. Keyed under ["leave-requests"] so the leave review
 * panels' invalidations refresh it.
 */
export function usePropertyPendingLeaveCount(propertyId: string) {
  return useQuery({
    queryKey: ["leave-requests", "property", propertyId, "PENDING", "count"],
    staleTime: 30_000,
    queryFn: async () => {
      const table = supabase.from("leave_requests" as never) as unknown as LeaveCountTable;
      const { count, error } = await table
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("status", "PENDING");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/** "07:42 AM" in the property's timezone. */
export function formatClock(iso: string, timeZone: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
}

/** "Thu, 27 Nov 2026" for a "YYYY-MM-DD" date (no timezone shift). */
export function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const AVATAR_TONES = [
  "bg-chart-cat-1/15 text-chart-cat-1",
  "bg-chart-cat-2/15 text-chart-cat-2",
  "bg-chart-cat-3/15 text-chart-cat-3",
  "bg-primary/10 text-primary",
];

export function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** "87%", or "0.7%" for shares under 1% so small groups don't read as 0. */
export function shareOf(value: number, total: number) {
  if (total <= 0) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}
