import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { OPEN_COMPLAINT_STATUSES } from "@/lib/complaint";
import { localDateInTimezone } from "@/lib/ops";
import {
  daysRemaining,
  getExpiryIndicator,
  relevantEndDate,
  type ExpiryIndicator,
} from "@/lib/subscription-expiry";

/**
 * Data hooks for the Hostel Admin dashboard. Every read is a plain RLS-scoped
 * client query (no service role), property-scoped where the table carries
 * `property_id`. Counts use `head: true` count queries so a large property
 * never trips PostgREST's 1000-row cap; the one row-level read (payments for
 * the collections series) is paged explicitly for the same reason.
 */

const STALE = 60_000;

/** Queries below only run when enabled (ids present); this narrows the type without a non-null assertion. */
function requireId(id: string | null): string {
  if (!id) throw new Error("Missing tenant/property id");
  return id;
}

/** Browser-local month window, offset by `monthOffset` (0 = this month, -1 = last month). */
export function monthWindow(monthOffset = 0, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
  return { start, end };
}

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

// ---------------------------------------------------------------------------
// Active property header details
// ---------------------------------------------------------------------------

export function useDashboardProperty(propertyId: string | null) {
  return useQuery({
    queryKey: ["admin-dashboard-property", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, city, state, timezone")
        .eq("id", requireId(propertyId))
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Headline KPIs (occupancy, residents, open complaints)
// ---------------------------------------------------------------------------

export interface AdminKpis {
  occupancyPct: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  activeStudents: number;
  /** ACTIVE students whose record was created this calendar month. */
  newStudentsThisMonth: number;
  openComplaints: number;
}

export function useAdminKpis(propertyId: string | null) {
  return useQuery({
    queryKey: ["admin-kpis", propertyId, monthKey()],
    enabled: !!propertyId,
    staleTime: STALE,
    queryFn: async (): Promise<AdminKpis> => {
      const { start } = monthWindow(0);
      const beds = () =>
        supabase
          .from("beds")
          .select("id", { count: "exact", head: true })
          .eq("property_id", requireId(propertyId))
          .is("deleted_at", null);
      const activeStudents = () =>
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("property_id", requireId(propertyId))
          .is("deleted_at", null)
          .eq("status", "ACTIVE");

      const [totalRes, occupiedRes, vacantRes, studentsRes, newStudentsRes, complaintsRes] =
        await Promise.all([
          beds(),
          beds().eq("status", "OCCUPIED"),
          beds().eq("status", "VACANT"),
          activeStudents(),
          activeStudents().gte("created_at", start.toISOString()),
          supabase
            .from("complaints")
            .select("id", { count: "exact", head: true })
            .eq("property_id", requireId(propertyId))
            .is("deleted_at", null)
            .in("status", OPEN_COMPLAINT_STATUSES),
        ]);
      for (const r of [
        totalRes,
        occupiedRes,
        vacantRes,
        studentsRes,
        newStudentsRes,
        complaintsRes,
      ]) {
        if (r.error) throw new Error(r.error.message);
      }

      // Same formula as v_occupancy_summary: occupied / (occupied + vacant) —
      // MAINTENANCE/BLOCKED beds are excluded from the denominator.
      const occupied = occupiedRes.count ?? 0;
      const vacant = vacantRes.count ?? 0;
      const occupiable = occupied + vacant;
      return {
        occupancyPct: occupiable > 0 ? Math.round((occupied / occupiable) * 100) : 0,
        totalBeds: totalRes.count ?? 0,
        occupiedBeds: occupied,
        vacantBeds: vacant,
        activeStudents: studentsRes.count ?? 0,
        newStudentsThisMonth: newStudentsRes.count ?? 0,
        openComplaints: complaintsRes.count ?? 0,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Collections (captured, non-simulated payments by paid_at)
// ---------------------------------------------------------------------------

export type CollectionsRange = "this-month" | "last-month";

export interface CollectionsPoint {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** "5 Jan" — x-axis/tooltip label. */
  label: string;
  dailyPaise: number;
  cumulativePaise: number;
}

export interface CollectionsSummary {
  totalPaise: number;
  /** Same-length window one month earlier (month-to-date vs the same days last month). */
  previousPaise: number;
  /** Rounded % change vs `previousPaise`; null when there is nothing to compare against. */
  deltaPct: number | null;
  points: CollectionsPoint[];
}

const PAGE_SIZE = 1000;

/**
 * Same filter the dashboard's "Collections this month" KPI has always used:
 * CAPTURED payments, excluding the `simulated` provider, by `paid_at`. Paged so
 * a busy month is never silently truncated at 1000 rows.
 */
async function fetchCapturedPayments(propertyId: string, from: Date, to: Date) {
  const rows: { amount_paise: number; paid_at: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, amount_paise, paid_at")
      .eq("property_id", propertyId)
      .eq("status", "CAPTURED")
      .or("provider.is.null,provider.neq.simulated")
      .gte("paid_at", from.toISOString())
      .lt("paid_at", to.toISOString())
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function localIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const dayLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export function useCollectionsSummary(propertyId: string | null, range: CollectionsRange) {
  return useQuery({
    queryKey: ["admin-dashboard-collections", propertyId, range, monthKey()],
    enabled: !!propertyId,
    staleTime: STALE,
    queryFn: async (): Promise<CollectionsSummary> => {
      const now = new Date();
      const isCurrent = range === "this-month";
      const cur = monthWindow(isCurrent ? 0 : -1, now);
      const prev = monthWindow(isCurrent ? -1 : -2, now);

      // This month runs to "now"; compare against the same elapsed span of
      // last month (capped at last month's end). Last month compares whole
      // months.
      const curEnd = isCurrent ? now : cur.end;
      const prevEnd = isCurrent
        ? new Date(
            Math.min(
              prev.start.getTime() + (now.getTime() - cur.start.getTime()),
              prev.end.getTime(),
            ),
          )
        : prev.end;

      const [curRows, prevRows] = await Promise.all([
        fetchCapturedPayments(requireId(propertyId), cur.start, curEnd),
        fetchCapturedPayments(requireId(propertyId), prev.start, prevEnd),
      ]);

      const byDay = new Map<string, number>();
      for (const r of curRows) {
        if (!r.paid_at) continue;
        const key = localIsoDate(new Date(r.paid_at));
        byDay.set(key, (byDay.get(key) ?? 0) + r.amount_paise);
      }

      const points: CollectionsPoint[] = [];
      let running = 0;
      const lastDay = isCurrent ? now.getDate() : new Date(cur.end.getTime() - 1).getDate();
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(cur.start.getFullYear(), cur.start.getMonth(), d);
        const key = localIsoDate(date);
        const daily = byDay.get(key) ?? 0;
        running += daily;
        points.push({
          date: key,
          label: dayLabel.format(date),
          dailyPaise: daily,
          cumulativePaise: running,
        });
      }

      const totalPaise = curRows.reduce((s, r) => s + r.amount_paise, 0);
      const previousPaise = prevRows.reduce((s, r) => s + r.amount_paise, 0);
      const deltaPct =
        previousPaise > 0 ? Math.round(((totalPaise - previousPaise) / previousPaise) * 100) : null;
      return { totalPaise, previousPaise, deltaPct, points };
    },
  });
}

// ---------------------------------------------------------------------------
// Attendance (today, property-local date)
// ---------------------------------------------------------------------------

export interface AttendanceToday {
  date: string;
  /** (Present + Late) / (Present + Late + Absent) — same rule as v_attendance_monthly_summary. */
  pct: number | null;
  /** Percentage-point change vs the previous day; null if either day is unmarked. */
  deltaPp: number | null;
  markedCount: number;
}

function previousIsoDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function useAttendanceToday(propertyId: string | null, timeZone: string | null | undefined) {
  const today = localDateInTimezone(timeZone);
  return useQuery({
    queryKey: ["admin-dashboard-attendance", propertyId, today],
    enabled: !!propertyId,
    staleTime: STALE,
    queryFn: async (): Promise<AttendanceToday> => {
      const yesterday = previousIsoDate(today);
      const count = (date: string, statuses: string[]) =>
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("property_id", requireId(propertyId))
          .eq("attendance_date", date)
          .in("status", statuses);

      const [tAttended, tAbsent, yAttended, yAbsent] = await Promise.all([
        count(today, ["PRESENT", "LATE"]),
        count(today, ["ABSENT"]),
        count(yesterday, ["PRESENT", "LATE"]),
        count(yesterday, ["ABSENT"]),
      ]);
      for (const r of [tAttended, tAbsent, yAttended, yAbsent]) {
        if (r.error) throw new Error(r.error.message);
      }
      const pct = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : null);
      const todayPct = pct(tAttended.count ?? 0, tAbsent.count ?? 0);
      const yesterdayPct = pct(yAttended.count ?? 0, yAbsent.count ?? 0);
      return {
        date: today,
        pct: todayPct,
        deltaPp: todayPct != null && yesterdayPct != null ? todayPct - yesterdayPct : null,
        markedCount: (tAttended.count ?? 0) + (tAbsent.count ?? 0),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// "Needs your attention" counts
// ---------------------------------------------------------------------------

/**
 * Pending KYC documents — the same rows KycApprovalQueueCard lists (RLS-scoped,
 * not property-filtered, exactly like that card). Keyed under
 * ["kyc-pending-queue", …] so the card's own invalidation after an
 * approve/reject refreshes this count too.
 */
export function usePendingKycCount() {
  return useQuery({
    queryKey: ["kyc-pending-queue", "count"],
    staleTime: STALE,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("owner_type", "STUDENT")
        .eq("verification_status", "PENDING")
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/** Allocations in NOTICE_GIVEN — the same rows MoveOutNoticesPanel shows on the Students page. */
export function useMoveOutNoticeCount(tenantId: string | null, propertyId: string | null) {
  return useQuery({
    queryKey: ["move-out-notices", tenantId, propertyId, "count"],
    enabled: !!tenantId && !!propertyId,
    staleTime: STALE,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("allocations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", requireId(tenantId))
        .eq("property_id", requireId(propertyId))
        .eq("status", "NOTICE_GIVEN")
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

// ---------------------------------------------------------------------------
// Plan expiry
// ---------------------------------------------------------------------------

export interface PlanExpiry {
  subscriptionId: string;
  status: string;
  endDate: string;
  days: number;
  indicator: NonNullable<ExpiryIndicator>;
}

/**
 * The tenant's latest subscription, reduced to the shared "ending soon"
 * signal (subscription-expiry.ts — same threshold Super Admin Billing uses).
 * Null when nothing needs flagging. `days` counts IST calendar days (0 = ends
 * later today) and the indicator is ENDED as soon as the end instant has
 * passed — see daysRemaining(). Separate key from Settings → Billing's
 * ["my-subscription", …] because it selects a different shape.
 */
export function usePlanExpiry(tenantId: string | null) {
  return useQuery({
    queryKey: ["admin-dashboard-plan-expiry", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * STALE,
    queryFn: async (): Promise<PlanExpiry | null> => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, status, trial_ends_at, current_period_end")
        .eq("tenant_id", requireId(tenantId))
        .in("status", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const endDate = relevantEndDate(data);
      const days = daysRemaining(endDate);
      const indicator = getExpiryIndicator(data.status, days);
      if (!indicator || !endDate || days == null) return null;
      return { subscriptionId: data.id, status: data.status, endDate, days, indicator };
    },
  });
}
