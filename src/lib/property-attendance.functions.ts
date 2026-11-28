import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { localDateInTimezone } from "@/lib/ops";

/**
 * Numbers and the roster for a property's Attendance tab. Everything is read
 * with the caller's own (RLS-scoped) client — these functions only aggregate,
 * so the page receives a handful of numbers / 8 table rows instead of every
 * attendance row. Rules (the same ones the rest of the app uses):
 *
 * - "Today" is the property-local date (properties.timezone, Asia/Kolkata
 *   fallback) via localDateInTimezone(), like the admin dashboard.
 * - Residents = ACTIVE students (the hero, dashboard and marking roster use
 *   the same rule); they are the denominator "Y" of "X / Y present".
 * - One status per student per day: attendance is unique per
 *   (student, date, session). The marking screens and leave approvals only
 *   write the DAILY session, so the DAILY row is used; if a student only has
 *   other-session rows that day (MORNING / EVENING, accepted by the API but
 *   not written by any screen) the most recently marked one counts.
 * - Attendance % = (Present + Late) / (Present + Late + Absent) — On leave,
 *   Out-pass and Not marked are in neither side (v_attendance_monthly_summary
 *   and the dashboard use the same rule). Days with nothing marked have no %.
 * - A resident's status today: approved leave (or an ON_LEAVE row) wins, then
 *   the saved Present / Late / Absent row, then Out-pass (an approved pass with
 *   an OUT gate scan and no IN scan yet — fn_students_on_out_pass), otherwise
 *   Not marked. Out-pass is never saved as an attendance row, so it only fills
 *   residents who have no saved mark.
 */

type Db = SupabaseClient<Database>;

const PAGE = 1000;
/** Safety cap on rows read per query; far above one property's size. */
const MAX_ROWS = 60_000;

const TODAY_STATUSES = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "OUT_PASS", "NOT_MARKED"] as const;
export type TodayStatus = (typeof TODAY_STATUSES)[number];

const propertyIdField = z
  .string()
  .uuid("This property could not be identified. Please refresh and try again.");

const loadError = () => new Error("We couldn't load this property's attendance. Please try again.");

/**
 * Reads every page of a query (PostgREST returns at most 1000 rows per
 * request): the first page carries the exact count, the rest load in parallel.
 */
async function readAll<T>(
  build: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const first = await build(0, PAGE - 1, true);
  if (first.error) throw loadError();
  const rows = [...(first.data ?? [])];
  const total = Math.min(first.count ?? rows.length, MAX_ROWS);
  const rest: PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>[] = [];
  for (let from = PAGE; from < total; from += PAGE) rest.push(build(from, from + PAGE - 1, false));
  for (const r of await Promise.all(rest)) {
    if (r.error) throw loadError();
    rows.push(...(r.data ?? []));
  }
  return rows;
}

function isValidZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" shifted by whole days (calendar arithmetic, no timezone involved). */
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The UTC instant at which local day `iso` starts in `timeZone`. */
function zonedDayStart(iso: string, timeZone: string): Date {
  const guess = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    return asUtc - ms;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

async function loadPropertyDay(supabase: Db, propertyId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("timezone")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw loadError();
  if (!data) throw new Error("We couldn't find this property. Please refresh and try again.");
  const tz = data.timezone && isValidZone(data.timezone) ? data.timezone : "Asia/Kolkata";
  return { tz, today: localDateInTimezone(tz) };
}

interface MarkRow {
  student_id: string;
  attendance_date: string;
  session: string;
  status: string;
  marked_at: string;
  notes: string | null;
}

/** One row per student per day — the DAILY session, else the latest-marked row. */
function onePerStudentDay(rows: MarkRow[]): Map<string, MarkRow> {
  const out = new Map<string, MarkRow>();
  for (const r of rows) {
    const key = `${r.attendance_date}|${r.student_id}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, r);
      continue;
    }
    if (prev.session === "DAILY") continue;
    if (r.session === "DAILY" || r.marked_at > prev.marked_at) out.set(key, r);
  }
  return out;
}

function readMarks(supabase: Db, propertyId: string, fromDate: string, toDate: string) {
  return readAll<MarkRow>((from, to, withCount) =>
    supabase
      .from("attendance")
      .select(
        "student_id, attendance_date, session, status, marked_at, notes",
        withCount ? { count: "exact" } : undefined,
      )
      .eq("property_id", propertyId)
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate)
      .order("id")
      .range(from, to),
  );
}

export interface AttendanceDayPoint {
  date: string;
  /** Present + Late. */
  attended: number;
  absent: number;
  onLeave: number;
  /** (Present + Late) / (Present + Late + Absent), rounded; null when nobody was marked. */
  pct: number | null;
}

function dayPoints(marks: Map<string, MarkRow>, dates: string[]): AttendanceDayPoint[] {
  const tallies = new Map(dates.map((d) => [d, { attended: 0, absent: 0, onLeave: 0 }]));
  for (const m of marks.values()) {
    const t = tallies.get(m.attendance_date);
    if (!t) continue;
    if (m.status === "PRESENT" || m.status === "LATE") t.attended += 1;
    else if (m.status === "ABSENT") t.absent += 1;
    else if (m.status === "ON_LEAVE") t.onLeave += 1;
  }
  return dates.map((date) => {
    const t = tallies.get(date) ?? { attended: 0, absent: 0, onLeave: 0 };
    const base = t.attended + t.absent;
    return { date, ...t, pct: base > 0 ? Math.round((t.attended / base) * 100) : null };
  });
}

/* ------------------------------------------------------- resident statuses */

interface LeaveQuery extends PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}> {
  select(columns: string): LeaveQuery;
  eq(column: string, value: string): LeaveQuery;
  lte(column: string, value: string): LeaveQuery;
  gte(column: string, value: string): LeaveQuery;
}

const leaveRowsSchema = z.array(z.object({ student_id: z.string() }));
const outPassRowsSchema = z.array(z.object({ student_id: z.string() }).passthrough());

/** Students on APPROVED leave covering `date` (leave_requests is not in the generated types yet). */
async function studentsOnLeave(supabase: Db, propertyId: string, date: string) {
  const table = supabase.from("leave_requests" as never) as unknown as LeaveQuery;
  const { data, error } = await table
    .select("student_id")
    .eq("property_id", propertyId)
    .eq("status", "APPROVED")
    .lte("start_date", date)
    .gte("end_date", date);
  // Approval also writes ON_LEAVE attendance rows for every covered day, so if
  // this lookup is unavailable those residents still read "On leave".
  if (error) return new Set<string>();
  const parsed = leaveRowsSchema.safeParse(data ?? []);
  return new Set(parsed.success ? parsed.data.map((r) => r.student_id) : []);
}

/** Students out on a pass today. Fails soft (empty) like the marking screen does. */
async function studentsOnOutPass(supabase: Db, propertyId: string, date: string) {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("fn_students_on_out_pass", {
    p_property_id: propertyId,
    p_date: date,
  });
  if (error) return new Set<string>();
  const parsed = outPassRowsSchema.safeParse(data ?? []);
  return new Set(parsed.success ? parsed.data.map((r) => r.student_id) : []);
}

const BED_HOLDING = [
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
];

interface ResidentRecord {
  id: string;
  full_name: string;
  admission_number: string;
  allocations: {
    status: string;
    deleted_at: string | null;
    block_id: string | null;
    floor_id: string;
    rooms: { room_number: string } | null;
    beds: { code: string } | null;
    blocks: { name: string } | null;
    floors: { name: string } | null;
  }[];
}

function readResidents(supabase: Db, propertyId: string, search: string) {
  // PostgREST's or() treats , ( ) as separators — keep them out of the term.
  const term = search.replace(/[,()*%\\]/g, " ").trim();
  return readAll<ResidentRecord>((from, to, withCount) => {
    let q = supabase
      .from("students")
      .select(
        "id, full_name, admission_number, allocations(status, deleted_at, block_id, floor_id, rooms(room_number), beds(code), blocks(name), floors(name))",
        withCount ? { count: "exact" } : undefined,
      )
      .eq("property_id", propertyId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .in("allocations.status", BED_HOLDING)
      .is("allocations.deleted_at", null)
      .order("full_name")
      .order("id")
      .range(from, to);
    if (term) q = q.or(`full_name.ilike.%${term}%,admission_number.ilike.%${term}%`);
    return q;
  });
}

/** Today's status of every active resident, plus today's saved mark (for times / remarks). */
async function residentStatuses(supabase: Db, propertyId: string, today: string, search = "") {
  const [residents, marks, onLeave, outPass] = await Promise.all([
    readResidents(supabase, propertyId, search),
    readMarks(supabase, propertyId, today, today),
    studentsOnLeave(supabase, propertyId, today),
    studentsOnOutPass(supabase, propertyId, today),
  ]);
  const todayMarks = new Map<string, MarkRow>();
  for (const m of onePerStudentDay(marks).values()) todayMarks.set(m.student_id, m);

  const statusOf = (id: string): TodayStatus => {
    const mark = todayMarks.get(id);
    if (onLeave.has(id) || mark?.status === "ON_LEAVE") return "ON_LEAVE";
    if (mark?.status === "PRESENT" || mark?.status === "LATE" || mark?.status === "ABSENT") {
      return mark.status;
    }
    if (outPass.has(id)) return "OUT_PASS";
    return "NOT_MARKED";
  };
  return {
    residents: residents.map((r) => ({
      ...r,
      status: statusOf(r.id),
      mark: todayMarks.get(r.id) ?? null,
    })),
    marks,
  };
}

/* ------------------------------------------------------------------ today */

export interface PropertyAttendanceToday {
  date: string;
  timeZone: string;
  /** Active residents ("Y"). */
  residents: number;
  counts: Record<TodayStatus, number>;
  /** Today's attendance %, per the rule above; null when nobody is marked yet. */
  pct: number | null;
  yesterdayPct: number | null;
  /** Percentage points vs yesterday; null when either day has no %. */
  deltaPp: number | null;
}

export const getPropertyAttendanceToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ property_id: propertyIdField }).parse(d))
  .handler(async ({ data, context }): Promise<PropertyAttendanceToday> => {
    const { supabase } = context;
    const pid = data.property_id;
    const { tz, today } = await loadPropertyDay(supabase, pid);
    const yesterday = addDays(today, -1);

    const [{ residents, marks: todayMarks }, yesterdayMarks] = await Promise.all([
      residentStatuses(supabase, pid, today),
      readMarks(supabase, pid, yesterday, yesterday),
    ]);
    const counts = Object.fromEntries(TODAY_STATUSES.map((s) => [s, 0])) as Record<
      TodayStatus,
      number
    >;
    for (const r of residents) counts[r.status] += 1;

    // The % (today and yesterday) comes from the day's saved marks — the trend
    // chart and the admin dashboard use the same numbers.
    const [t] = dayPoints(onePerStudentDay(todayMarks), [today]);
    const [y] = dayPoints(onePerStudentDay(yesterdayMarks), [yesterday]);
    const pct = t?.pct ?? null;
    const yesterdayPct = y?.pct ?? null;
    return {
      date: today,
      timeZone: tz,
      residents: residents.length,
      counts,
      pct,
      yesterdayPct,
      deltaPp: pct != null && yesterdayPct != null ? pct - yesterdayPct : null,
    };
  });

/* ------------------------------------------------------------------ trend */

export const getPropertyAttendanceTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({ property_id: propertyIdField, days: z.union([z.literal(7), z.literal(30)]) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AttendanceDayPoint[]> => {
    const { supabase } = context;
    const pid = data.property_id;
    const { today } = await loadPropertyDay(supabase, pid);
    const dates = Array.from({ length: data.days }, (_, i) => addDays(today, i - data.days + 1));
    const marks = await readMarks(supabase, pid, dates[0] ?? today, today);
    return dayPoints(onePerStudentDay(marks), dates);
  });

/* ----------------------------------------------------------------- roster */

interface TodayAttendanceRow {
  id: string;
  full_name: string;
  admission_number: string;
  room: string | null;
  bed: string | null;
  block: string | null;
  floor: string | null;
  status: TodayStatus;
  /** When today's Present / Late mark was saved. */
  checkInAt: string | null;
  /** Latest OUT gate scan today. */
  checkOutAt: string | null;
  /** IN gate scan after that exit, if the resident is back. */
  backAt: string | null;
  remark: string | null;
}

interface TodayAttendanceRoster {
  date: string;
  timeZone: string;
  rows: TodayAttendanceRow[];
  total: number;
}

const rosterInput = z.object({
  property_id: propertyIdField,
  block_id: z.string().uuid().nullable(),
  floor_id: z.string().uuid().nullable(),
  status: z.enum(TODAY_STATUSES).nullable(),
  q: z.string().max(80),
  page: z.number().int().min(0).max(100_000),
  page_size: z.number().int().min(1).max(5000),
});

export const getTodayAttendanceRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => rosterInput.parse(d))
  .handler(async ({ data, context }): Promise<TodayAttendanceRoster> => {
    const { supabase } = context;
    const pid = data.property_id;
    const { tz, today } = await loadPropertyDay(supabase, pid);
    const { residents } = await residentStatuses(supabase, pid, today, data.q);

    const matching = residents
      .map((r) => ({
        ...r,
        stay: r.allocations.find((a) => !a.deleted_at && BED_HOLDING.includes(a.status)) ?? null,
      }))
      .filter(
        (r) =>
          (!data.block_id || r.stay?.block_id === data.block_id) &&
          (!data.floor_id || r.stay?.floor_id === data.floor_id) &&
          (!data.status || r.status === data.status),
      );
    const start = data.page * data.page_size;
    const page = matching.slice(start, start + data.page_size);

    // Gate scans today for the residents on this page only.
    const ids = page.map((r) => r.id);
    const dayStart = zonedDayStart(today, tz).toISOString();
    const dayEnd = zonedDayStart(addDays(today, 1), tz).toISOString();
    const gate = new Map<string, { out: string | null; back: string | null }>();
    if (ids.length) {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("gate_events")
            .select("student_id, direction, event_at")
            .eq("property_id", pid)
            .in("student_id", chunk)
            .gte("event_at", dayStart)
            .lt("event_at", dayEnd)
            .order("event_at")
            .limit(5000),
        ),
      );
      // Gate times are extra detail: without gate access they read "—".
      const events = results.flatMap((r) => (r.error ? [] : (r.data ?? [])));
      for (const e of events) {
        if (!e.student_id) continue;
        const g = gate.get(e.student_id) ?? { out: null, back: null };
        if (e.direction === "OUT") {
          g.out = e.event_at;
          g.back = null;
        } else if (e.direction === "IN" && g.out) {
          g.back = e.event_at;
        }
        gate.set(e.student_id, g);
      }
    }

    return {
      date: today,
      timeZone: tz,
      total: matching.length,
      rows: page.map((r) => {
        const g = gate.get(r.id);
        return {
          id: r.id,
          full_name: r.full_name,
          admission_number: r.admission_number,
          room: r.stay?.rooms?.room_number ?? null,
          bed: r.stay?.beds?.code ?? null,
          block: r.stay?.blocks?.name ?? null,
          floor: r.stay?.floors?.name ?? null,
          status: r.status,
          checkInAt:
            (r.status === "PRESENT" || r.status === "LATE") && r.mark ? r.mark.marked_at : null,
          checkOutAt: g?.out ?? null,
          backAt: g?.back ?? null,
          remark: r.mark?.notes ?? null,
        };
      }),
    };
  });
