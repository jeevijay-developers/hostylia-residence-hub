import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Property Overview numbers. Everything is read with the caller's own
 * (RLS-scoped) client, so a user only ever sees properties their policies
 * allow; the work happens here only so the page receives a few dozen numbers
 * instead of every allocation/student row.
 *
 * Definitions follow the rest of the admin app:
 * - Residents = ACTIVE students (the dashboard and property cards use the same rule).
 * - Occupancy = occupied / (occupied + vacant), like v_occupancy_summary.
 * - A stay is an allocation that went live: ACTIVE, NOTICE_GIVEN,
 *   MOVE_OUT_INSPECTION or CLOSED (drafts, pending and cancelled never had
 *   anyone in the bed).
 */

const LIVE_STAY = ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION"];
const ANY_STAY = [...LIVE_STAY, "CLOSED"];
const PAGE = 1000;
/** Safety cap on rows read per query (≈ 20 pages); far above any one property's size. */
const MAX_ROWS = 20_000;

const propertyIdField = z
  .string()
  .uuid("This property could not be identified. Please refresh and try again.");

const loadError = () => new Error("We couldn't load this property's numbers. Please try again.");

/** Reads every page of a query (PostgREST returns at most 1000 rows per request). */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw loadError();
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** First instant of the current month and of the next one, in India time (the app's business zone). */
function monthBounds(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - 330 * 60_000);
  const end = new Date(Date.UTC(y, m + 1, 1) - 330 * 60_000);
  const isoDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return { start, end, startDate: isoDate(start), endDate: isoDate(end) };
}

export interface PropertyOverviewStats {
  beds: {
    total: number;
    occupied: number;
    vacant: number;
    occupancyPct: number;
    vacantPct: number;
  };
  blocksCount: number;
  residents: number;
  newThisMonth: number;
  movedOutThisMonth: number;
  leavingThisMonth: number;
  blockwise: { id: string; name: string; students: number }[];
  gender: { boys: number; girls: number; others: number; notSpecified: number };
}

export const getPropertyOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ property_id: propertyIdField }).parse(d))
  .handler(async ({ data, context }): Promise<PropertyOverviewStats> => {
    const { supabase } = context;
    const pid = data.property_id;
    const { start, startDate, endDate } = monthBounds();

    const beds = () =>
      supabase
        .from("beds")
        .select("id", { count: "exact", head: true })
        .eq("property_id", pid)
        .is("deleted_at", null);
    const students = () =>
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("property_id", pid)
        .is("deleted_at", null);

    const [totalRes, occRes, vacRes, residentsRes, newRes, outRes, leavingRes, blocksRes] =
      await Promise.all([
        beds(),
        beds().eq("status", "OCCUPIED"),
        beds().eq("status", "VACANT"),
        students().eq("status", "ACTIVE"),
        students().eq("status", "ACTIVE").gte("created_at", start.toISOString()),
        students()
          .eq("status", "MOVED_OUT")
          // moved_out_at is a DATE, so compare with India-time calendar dates.
          .gte("moved_out_at", startDate)
          .lt("moved_out_at", endDate),
        // Notice given and due to leave before the month ends (overdue ones included).
        supabase
          .from("allocations")
          .select("id", { count: "exact", head: true })
          .eq("property_id", pid)
          .is("deleted_at", null)
          .in("status", ["NOTICE_GIVEN", "MOVE_OUT_INSPECTION"])
          .lt("requested_move_out_date", endDate),
        supabase
          .from("blocks")
          .select("id, name, display_order")
          .eq("property_id", pid)
          .is("deleted_at", null)
          .order("display_order")
          .order("name"),
      ]);
    for (const r of [totalRes, occRes, vacRes, residentsRes, newRes, outRes, leavingRes]) {
      if (r.error) throw loadError();
    }
    if (blocksRes.error) throw loadError();

    const [liveStays, residentGenders] = await Promise.all([
      readAll<{ block_id: string | null }>((from, to) =>
        supabase
          .from("allocations")
          .select("block_id")
          .eq("property_id", pid)
          .is("deleted_at", null)
          .in("status", LIVE_STAY)
          .order("id")
          .range(from, to),
      ),
      readAll<{ gender: string | null }>((from, to) =>
        supabase
          .from("students")
          .select("gender")
          .eq("property_id", pid)
          .is("deleted_at", null)
          .eq("status", "ACTIVE")
          .order("id")
          .range(from, to),
      ),
    ]);

    const perBlock = new Map<string | null, number>();
    for (const s of liveStays) perBlock.set(s.block_id, (perBlock.get(s.block_id) ?? 0) + 1);
    const blockwise = (blocksRes.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      students: perBlock.get(b.id) ?? 0,
    }));
    const unblocked = perBlock.get(null) ?? 0;
    if (unblocked > 0 || blockwise.length === 0) {
      blockwise.push({
        id: "none",
        name: blockwise.length ? "No block" : "All rooms",
        students: unblocked,
      });
    }

    const gender = { boys: 0, girls: 0, others: 0, notSpecified: 0 };
    for (const s of residentGenders) {
      const g = (s.gender ?? "").toUpperCase();
      if (g === "MALE") gender.boys++;
      else if (g === "FEMALE") gender.girls++;
      else if (g) gender.others++;
      else gender.notSpecified++;
    }

    const occupied = occRes.count ?? 0;
    const vacant = vacRes.count ?? 0;
    const occupiable = occupied + vacant;
    const occupancyPct = occupiable > 0 ? Math.round((occupied / occupiable) * 100) : 0;
    return {
      beds: {
        total: totalRes.count ?? 0,
        occupied,
        vacant,
        occupancyPct,
        // Same rule as the Rooms & Beds tab, so the two always add up to 100.
        vacantPct: occupiable > 0 ? 100 - occupancyPct : 0,
      },
      blocksCount: (blocksRes.data ?? []).length,
      residents: residentsRes.count ?? 0,
      newThisMonth: newRes.count ?? 0,
      movedOutThisMonth: outRes.count ?? 0,
      leavingThisMonth: leavingRes.count ?? 0,
      blockwise,
      gender,
    };
  });

export const studentTrendRanges = ["30d", "90d", "12m"] as const;
export type StudentTrendRange = (typeof studentTrendRanges)[number];

export interface StudentTrendPoint {
  /** yyyy-mm-dd (India time). */
  date: string;
  students: number;
}

/**
 * Students staying on each day of the range, rebuilt from allocation history:
 * a stay counts from its start date until it ended (actual end date, or the
 * day it was closed). 12 months is sampled weekly to keep the chart light.
 */
export const getPropertyStudentTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        property_id: propertyIdField,
        range: z.enum(studentTrendRanges, {
          errorMap: () => ({ message: "Choose a period for the chart" }),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<StudentTrendPoint[]> => {
    const { supabase } = context;
    const days = data.range === "30d" ? 30 : data.range === "90d" ? 90 : 365;
    const step = data.range === "12m" ? 7 : 1;

    const todayIst = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const today = new Date(`${todayIst}T00:00:00Z`);
    const first = new Date(today.getTime() - (days - 1) * 86_400_000);
    const firstDate = first.toISOString().slice(0, 10);

    const stays = await readAll<{
      start_date: string;
      actual_end_date: string | null;
      closed_at: string | null;
      status: string;
    }>((from, to) =>
      supabase
        .from("allocations")
        .select("start_date, actual_end_date, closed_at, status")
        .eq("property_id", data.property_id)
        .is("deleted_at", null)
        .in("status", ANY_STAY)
        .lte("start_date", todayIst)
        .or(`actual_end_date.is.null,actual_end_date.gte.${firstDate}`)
        .order("id")
        .range(from, to),
    );

    const ranges = stays.map((s) => {
      const ended =
        s.actual_end_date ??
        (s.status === "CLOSED" && s.closed_at
          ? new Date(new Date(s.closed_at).getTime() + 330 * 60_000).toISOString().slice(0, 10)
          : null);
      return { from: s.start_date.slice(0, 10), until: ended };
    });

    const points: StudentTrendPoint[] = [];
    // Walk back from today so the last point is always "today".
    for (let offset = 0; offset < days; offset += step) {
      const date = new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
      let students = 0;
      for (const r of ranges) {
        // Leaving day counts as gone; joining day counts as present.
        if (r.from <= date && (r.until === null || r.until > date)) students++;
      }
      points.push({ date, students });
    }
    return points.reverse();
  });
