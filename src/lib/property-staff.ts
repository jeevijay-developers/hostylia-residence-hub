import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { listStaff } from "@/lib/admin-staff.functions";
import { emailSchema, normalizeIndianPhone } from "@/schemas/auth";

/**
 * Data for a property's Staff tab — the property STAFF ROSTER.
 *
 * The app has exactly six login roles. Caretaker / Security / Housekeeping /
 * Mess Manager / Maintenance are job DESIGNATIONS of roster rows, not logins;
 * a roster row may link to a Warden / Accountant login through `user_id`.
 *
 * Every read and write is a plain RLS call (Hostel Admin full access, Warden of
 * the property read-only). Integrity (tenant ↔ property ↔ block ↔ login) and
 * the audit trail live in the database, in
 * supabase/migrations/20261203090000_property_staff_roster.sql, so no client
 * path can skip them.
 */

type PropertyStaffRow = Tables<"property_staff">;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
type PgError = { code?: string; message?: string } | null;

function writeError(error: PgError, fallback: string): Error {
  const msg = error?.message ?? "";
  if (error?.code === "42501" || msg.toLowerCase().includes("row-level security")) {
    return new Error("Only a Hostel Admin can change this property's staff.");
  }
  if (error?.code === "23505") {
    return new Error("This login is already on this property's staff roster.");
  }
  // Integrity trigger messages are written for people — show them as is.
  if (error?.code === "23514" && msg) return new Error(msg);
  return new Error(fallback);
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
export const STAFF_DESIGNATIONS = [
  "WARDEN",
  "ACCOUNTANT",
  "CARETAKER",
  "SECURITY",
  "HOUSEKEEPING",
  "MESS_MANAGER",
  "MAINTENANCE",
  "OTHER",
] as const;
export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number];

export const DESIGNATION_LABEL: Record<StaffDesignation, string> = {
  WARDEN: "Warden",
  ACCOUNTANT: "Accountant",
  CARETAKER: "Caretaker",
  SECURITY: "Security",
  HOUSEKEEPING: "Housekeeping",
  MESS_MANAGER: "Mess Manager",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

/** Designations that can also be given an app login (the two delegated login roles). */
const LOGIN_DESIGNATIONS = ["WARDEN", "ACCOUNTANT"] as const;
type LoginDesignation = (typeof LOGIN_DESIGNATIONS)[number];
export const isLoginDesignation = (d: string): d is LoginDesignation =>
  (LOGIN_DESIGNATIONS as readonly string[]).includes(d);

export const STAFF_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

const STAFF_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "ON_LEAVE"] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];

export const asDesignation = (v: string): StaffDesignation =>
  (STAFF_DESIGNATIONS as readonly string[]).includes(v) ? (v as StaffDesignation) : "OTHER";
const asStaffStatus = (v: string): StaffStatus =>
  (STAFF_STATUSES as readonly string[]).includes(v) ? (v as StaffStatus) : "INACTIVE";

// ---------------------------------------------------------------------------
// Schemas (one per entity; the forms parse with these before writing)
// ---------------------------------------------------------------------------
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters)`)
    .transform((v) => (v === "" ? null : v));

const optionalTime = z
  .string()
  .trim()
  .refine((v) => v === "" || TIME_RE.test(v), "Enter a valid time")
  .transform((v) => (v === "" ? null : v.slice(0, 5)));

/** 10-digit Indian mobiles become +91…; other international numbers are kept with their +. */
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const digits = v.replace(/\D/g, "");
    if (v.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
    return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
  }, "Enter a 10-digit mobile number (or +country code)")
  .transform((v) => {
    if (v === "") return null;
    const digits = v.replace(/\D/g, "");
    if (v.startsWith("+")) return `+${digits}`;
    return normalizeIndianPhone(digits.length === 12 ? digits.slice(2) : digits);
  });

const shiftFields = {
  block_id: z.string().uuid().nullable(),
  work_area: optionalText(60, "Work area"),
  shift_name: optionalText(40, "Shift name"),
  shift_start: optionalTime,
  shift_end: optionalTime,
};

const bothTimesOrNeither = <T extends { shift_start: string | null; shift_end: string | null }>(
  v: T,
) => (v.shift_start === null) === (v.shift_end === null);
const bothTimesMessage = {
  message: "Set both the start and end time, or leave both empty",
  path: ["shift_end"],
};
const shiftTimesSchema = z
  .object({ shift_start: optionalTime, shift_end: optionalTime })
  .refine(bothTimesOrNeither, bothTimesMessage);

/**
 * Zod skips an object's refine while any field is invalid, so a half-set shift
 * would only be reported after the other errors are fixed. Forms add these
 * issues to their own to show every problem at once.
 */
export const shiftTimesIssues = (v: { shift_start: string; shift_end: string }) =>
  shiftTimesSchema.safeParse(v).error?.issues ?? [];

/** A roster entry — every column the directory shows is settable here. */
export const staffMemberSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Enter the staff member's name")
      .max(120, "Name is too long"),
    email: z
      .union([z.literal(""), emailSchema])
      .transform((v) => (v === "" ? null : v.toLowerCase())),
    phone: optionalPhone,
    designation: z.enum(STAFF_DESIGNATIONS),
    status: z.enum(STAFF_STATUSES),
    joined_on: z
      .string()
      .trim()
      .refine((v) => v === "" || DATE_RE.test(v), "Enter a valid date")
      .transform((v) => (v === "" ? null : v)),
    notes: optionalText(1000, "Notes"),
    ...shiftFields,
  })
  .refine(bothTimesOrNeither, bothTimesMessage);
export type StaffMemberFormValues = z.input<typeof staffMemberSchema>;
export type StaffMemberInput = z.output<typeof staffMemberSchema>;

/** Assign shift: who works when, and where. */
export const staffShiftSchema = z
  .object({ staff_id: z.string().uuid("Choose a staff member"), ...shiftFields })
  .refine(bothTimesOrNeither, bothTimesMessage);
export type StaffShiftFormValues = z.input<typeof staffShiftSchema>;
export type StaffShiftInput = z.output<typeof staffShiftSchema>;

/** Leave for one staff member over an inclusive date range (max 90 days). */
export const staffLeaveSchema = z
  .object({
    staff_id: z.string().uuid("Choose a staff member"),
    from: z.string().regex(DATE_RE, "Choose the first day"),
    to: z.string().regex(DATE_RE, "Choose the last day"),
    note: optionalText(500, "Reason"),
  })
  .refine((v) => v.to >= v.from, {
    message: "The last day can't be before the first",
    path: ["to"],
  })
  .refine((v) => daysBetween(v.from, v.to) < 90, {
    message: "Record at most 90 days at a time",
    path: ["to"],
  });
export type StaffLeaveFormValues = z.input<typeof staffLeaveSchema>;
export type StaffLeaveInput = z.output<typeof staffLeaveSchema>;

/** One day's attendance mark for one staff member. */
const staffAttendanceMarkSchema = z.object({
  staff_id: z.string().uuid(),
  status: z.enum(STAFF_ATTENDANCE_STATUSES),
});
type StaffAttendanceMark = z.infer<typeof staffAttendanceMarkSchema>;

// ---------------------------------------------------------------------------
// Date helpers (YYYY-MM-DD, calendar arithmetic in UTC — no timezone drift)
// ---------------------------------------------------------------------------
const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
export function addDays(iso: string, n: number) {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
/** "08:00:00" → "8 AM", "08:30" → "8:30 AM". */
function formatShiftTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "Day (8 AM – 4 PM)", "8 AM – 4 PM", "On call", or null. */
export function shiftLabel(s: {
  shift_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
}) {
  const times =
    s.shift_start && s.shift_end
      ? `${formatShiftTime(s.shift_start)} – ${formatShiftTime(s.shift_end)}`
      : null;
  if (s.shift_name && times) return `${s.shift_name} (${times})`;
  return s.shift_name ?? times;
}

/** "+91 98290 11234" for Indian mobiles; anything else as stored. */
export function formatStaffPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : phone;
}

/** "+919829011234" → "9829011234" for editing. */
export function phoneForInput(phone: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : phone;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export const STAFF_PAGE = 8;
/** PostgREST's default max_rows — larger reads must page in chunks of this size. */
const ATTENDANCE_PAGE = 1000;

export type RosterStaff = Omit<PropertyStaffRow, "designation" | "status"> & {
  designation: StaffDesignation;
  status: StaffStatus;
};

const ROSTER_COLUMNS =
  "id, tenant_id, property_id, user_id, full_name, phone, email, designation, block_id, work_area, shift_name, shift_start, shift_end, status, joined_on, notes, created_at, updated_at, created_by, deleted_at, deleted_by";

const toRoster = (r: PropertyStaffRow): RosterStaff => ({
  ...r,
  designation: asDesignation(r.designation),
  status: asStaffStatus(r.status),
});

export type StaffFilter = {
  q: string;
  designation: StaffDesignation | "ALL";
  status: StaffStatus | "ALL";
};

/** PostgREST's or() treats , ( ) as separators — keep them out of the search term. */
const cleanTerm = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

/**
 * The status shown everywhere on the Staff tab (directory pill, status filter,
 * KPIs, CSV): a deactivated person stays Inactive; otherwise someone whose
 * roster status is On leave, or who has an On leave mark for today (recorded
 * via Leave requests), is On leave; everyone else is Active.
 */
export function effectiveStaffStatus(
  s: Pick<RosterStaff, "status">,
  todayMark: StaffAttendanceStatus | undefined,
): StaffStatus {
  if (s.status === "INACTIVE") return "INACTIVE";
  if (s.status === "ON_LEAVE" || todayMark === "ON_LEAVE") return "ON_LEAVE";
  return "ACTIVE";
}

/**
 * One page (8) of the roster, filtered and searched in the database.
 * `leaveToday` = ids of staff with an On leave mark today, so the status filter
 * matches {@link effectiveStaffStatus}; `null` while still unknown (query waits).
 */
export function useStaffDirectory(
  propertyId: string,
  opts: StaffFilter & { page: number; leaveToday: readonly string[] | null },
) {
  const leaveIds = opts.leaveToday ?? [];
  // Only the status filters that depend on today's leave need the ids in the key.
  const leaveKey = opts.status === "ACTIVE" || opts.status === "ON_LEAVE" ? leaveIds.join(",") : "";
  return useQuery({
    queryKey: [
      "property-staff",
      propertyId,
      "directory",
      opts.q,
      opts.designation,
      opts.status,
      leaveKey,
      opts.page,
    ],
    enabled: opts.leaveToday !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: RosterStaff[]; total: number }> => {
      const from = opts.page * STAFF_PAGE;
      let query = supabase
        .from("property_staff")
        .select(ROSTER_COLUMNS, { count: "exact" })
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true })
        .range(from, from + STAFF_PAGE - 1);
      if (opts.designation !== "ALL") query = query.eq("designation", opts.designation);
      const onLeaveIds = `(${leaveIds.join(",")})`;
      if (opts.status === "INACTIVE") {
        query = query.eq("status", "INACTIVE");
      } else if (opts.status === "ACTIVE") {
        query = query.eq("status", "ACTIVE");
        if (leaveIds.length > 0) query = query.not("id", "in", onLeaveIds);
      } else if (opts.status === "ON_LEAVE") {
        query =
          leaveIds.length > 0
            ? query.or(`status.eq.ON_LEAVE,and(status.eq.ACTIVE,id.in.${onLeaveIds})`)
            : query.eq("status", "ON_LEAVE");
      }
      const term = cleanTerm(opts.q);
      if (term) {
        const digits = term.replace(/\D/g, "");
        query = query.or(
          [
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : []),
          ].join(","),
        );
      }
      const { data, error, count } = await query;
      if (error) throw new Error("We couldn't load the staff directory. Please try again.");
      return { rows: (data ?? []).map(toRoster), total: count ?? 0 };
    },
  });
}

interface StaffSummary {
  /** Every live roster row (small — a property has tens of staff, capped at 1000). */
  staff: RosterStaff[];
  /** Today's (property-local) attendance marks, by staff id. */
  today: Map<string, StaffAttendanceStatus>;
}

/**
 * The whole live roster plus today's marks — feeds the KPIs, the role donut and
 * the Assign shift / Mark attendance / Leave / Reports dialogs.
 */
export function useStaffSummary(propertyId: string, today: string) {
  return useQuery({
    queryKey: ["property-staff", propertyId, "summary", today],
    queryFn: async (): Promise<StaffSummary> => {
      const [staffRes, attRes] = await Promise.all([
        supabase
          .from("property_staff")
          .select(ROSTER_COLUMNS)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("full_name", { ascending: true })
          .limit(1000),
        supabase
          .from("property_staff_attendance")
          .select("staff_id, status")
          .eq("property_id", propertyId)
          .eq("attendance_date", today)
          .limit(1000),
      ]);
      if (staffRes.error || attRes.error) {
        throw new Error("We couldn't load the staff summary. Please try again.");
      }
      const live = new Set((staffRes.data ?? []).map((s) => s.id));
      const marks = new Map<string, StaffAttendanceStatus>();
      for (const a of attRes.data ?? []) {
        const parsed = staffAttendanceMarkSchema.shape.status.safeParse(a.status);
        if (parsed.success && live.has(a.staff_id)) marks.set(a.staff_id, parsed.data);
      }
      return { staff: (staffRes.data ?? []).map(toRoster), today: marks };
    },
  });
}

export interface StaffKpis {
  total: number;
  active: number;
  onDutyToday: number;
  onLeave: number;
}

/**
 * KPI definitions (Staff tab):
 *   Total staff   — live (not removed) roster rows.
 *   Active        — roster rows whose {@link effectiveStaffStatus} is ACTIVE.
 *   On duty today — roster rows marked PRESENT for today (property-local date).
 *   On leave      — roster rows whose {@link effectiveStaffStatus} is ON_LEAVE
 *                   (status On leave, or an On leave mark today).
 * Active and On leave use the same definition as the directory pill and filter.
 */
export function staffKpis(summary: StaffSummary): StaffKpis {
  let active = 0;
  let onDutyToday = 0;
  let onLeave = 0;
  for (const s of summary.staff) {
    const mark = summary.today.get(s.id);
    const status = effectiveStaffStatus(s, mark);
    if (status === "ACTIVE") active += 1;
    else if (status === "ON_LEAVE") onLeave += 1;
    if (mark === "PRESENT") onDutyToday += 1;
  }
  return { total: summary.staff.length, active, onDutyToday, onLeave };
}

/** Ids of live staff with an On leave mark today, sorted (stable for query keys). */
export function staffOnLeaveToday(summary: StaffSummary): string[] {
  const ids: string[] = [];
  for (const [id, mark] of summary.today) if (mark === "ON_LEAVE") ids.push(id);
  return ids.sort();
}

export type LoginStaff = Awaited<ReturnType<typeof listStaff>>[number];

/**
 * Warden / Accountant logins scoped to this property (Settings → Staff),
 * excluding revoked ones. Admin-only (listStaff checks HOSTEL_ADMIN).
 */
export function useLoginStaff(tenantId: string, propertyId: string) {
  const listFn = useServerFn(listStaff);
  return useQuery({
    queryKey: ["property-staff", propertyId, "logins", tenantId],
    staleTime: 60_000,
    // Page 1 of the directory waits for this list; a failure is rarely transient.
    retry: 1,
    queryFn: async () => {
      const rows = await listFn({ data: { tenant_id: tenantId, property_id: propertyId } });
      return rows.filter((r) => !r.revoked_at);
    },
  });
}

export interface StaffBlock {
  id: string;
  name: string;
}

export function useStaffBlocks(propertyId: string) {
  return useQuery({
    queryKey: ["property-staff", propertyId, "blocks"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StaffBlock[]> => {
      const { data, error } = await supabase
        .from("blocks")
        .select("id, name")
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error("We couldn't load the blocks. Please try again.");
      return (data ?? []).map((b) => ({ id: b.id, name: b.name }));
    },
  });
}

interface StaffLeaveRange {
  key: string;
  staff_id: string;
  from: string;
  to: string;
  note: string | null;
}

/** Current and upcoming leave (ON_LEAVE marks from today on), merged into date ranges. */
export function useStaffLeaves(propertyId: string, today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["property-staff", propertyId, "leaves", today],
    enabled,
    queryFn: async (): Promise<StaffLeaveRange[]> => {
      const { data, error } = await supabase
        .from("property_staff_attendance")
        .select("staff_id, attendance_date, note")
        .eq("property_id", propertyId)
        .eq("status", "ON_LEAVE")
        .gte("attendance_date", today)
        .order("staff_id")
        .order("attendance_date")
        .limit(1000);
      if (error) throw new Error("We couldn't load leave. Please try again.");
      const ranges: StaffLeaveRange[] = [];
      for (const r of data ?? []) {
        const last = ranges.at(-1);
        if (last && last.staff_id === r.staff_id && addDays(last.to, 1) === r.attendance_date) {
          last.to = r.attendance_date;
        } else {
          ranges.push({
            key: `${r.staff_id}:${r.attendance_date}`,
            staff_id: r.staff_id,
            from: r.attendance_date,
            to: r.attendance_date,
            note: r.note,
          });
        }
      }
      return ranges.sort((a, b) => a.from.localeCompare(b.from));
    },
  });
}

/** This month's (1st → today) attendance counts per staff member, for the CSV report. */
export async function fetchMonthAttendance(propertyId: string, today: string) {
  const counts = new Map<string, { present: number; absent: number; leave: number }>();
  // PostgREST caps every response at max_rows (1000), so page through the month
  // in a stable order until a short page signals the end.
  for (let from = 0; ; from += ATTENDANCE_PAGE) {
    const { data, error } = await supabase
      .from("property_staff_attendance")
      .select("staff_id, status")
      .eq("property_id", propertyId)
      .gte("attendance_date", monthStart(today))
      .lte("attendance_date", today)
      .order("id", { ascending: true })
      .range(from, from + ATTENDANCE_PAGE - 1);
    if (error) throw writeError(error, "We couldn't load this month's attendance.");
    const rows = data ?? [];
    for (const r of rows) {
      const c = counts.get(r.staff_id) ?? { present: 0, absent: 0, leave: 0 };
      if (r.status === "PRESENT") c.present += 1;
      else if (r.status === "ABSENT") c.absent += 1;
      else if (r.status === "ON_LEAVE") c.leave += 1;
      counts.set(r.staff_id, c);
    }
    if (rows.length < ATTENDANCE_PAGE) break;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Writes (RLS client; DB triggers validate scope and write audit_logs)
// ---------------------------------------------------------------------------
export async function createRosterStaff(args: {
  tenantId: string;
  propertyId: string;
  userId: string | null;
  member: StaffMemberInput;
}) {
  const m = args.member;
  const { data, error } = await supabase
    .from("property_staff")
    .insert({
      tenant_id: args.tenantId,
      property_id: args.propertyId,
      user_id: args.userId,
      full_name: m.full_name,
      email: m.email,
      phone: m.phone,
      designation: m.designation,
      block_id: m.block_id,
      work_area: m.block_id ? null : m.work_area,
      shift_name: m.shift_name,
      shift_start: m.shift_start,
      shift_end: m.shift_end,
      status: m.status,
      joined_on: m.joined_on,
      notes: m.notes,
    })
    .select("id")
    .single();
  if (error || !data)
    throw writeError(error, "We couldn't add this staff member. Please try again.");
  return data.id;
}

type RosterPatch = Partial<
  Pick<
    PropertyStaffRow,
    | "user_id"
    | "full_name"
    | "email"
    | "phone"
    | "designation"
    | "block_id"
    | "work_area"
    | "shift_name"
    | "shift_start"
    | "shift_end"
    | "status"
    | "joined_on"
    | "notes"
  >
>;

export async function updateRosterStaff(id: string, patch: RosterPatch) {
  const next = patch.block_id ? { ...patch, work_area: null } : patch;
  const { data, error } = await supabase
    .from("property_staff")
    .update(next)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw writeError(error, "We couldn't save this staff member. Please try again.");
  if (!data || data.length === 0) {
    throw new Error("This staff member was removed or you no longer have access.");
  }
}

/** Soft delete — the row stays for the audit trail and past attendance. */
export async function removeRosterStaff(id: string) {
  const { data, error } = await supabase
    .from("property_staff")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw writeError(error, "We couldn't remove this staff member. Please try again.");
  if (!data || data.length === 0) throw new Error("This staff member was already removed.");
}

export async function saveStaffAttendance(args: {
  tenantId: string;
  propertyId: string;
  date: string;
  marks: StaffAttendanceMark[];
}) {
  if (args.marks.length === 0) return;
  const rows = args.marks.map((m) => ({
    tenant_id: args.tenantId,
    property_id: args.propertyId,
    staff_id: m.staff_id,
    attendance_date: args.date,
    status: m.status,
  }));
  const { error } = await supabase
    .from("property_staff_attendance")
    .upsert(rows, { onConflict: "staff_id,attendance_date" });
  if (error) throw writeError(error, "We couldn't save attendance. Please try again.");
}

export async function recordStaffLeave(args: {
  tenantId: string;
  propertyId: string;
  staffId: string;
  from: string;
  to: string;
  note: string | null;
}) {
  const days = daysBetween(args.from, args.to);
  const rows = Array.from({ length: days + 1 }, (_, i) => ({
    tenant_id: args.tenantId,
    property_id: args.propertyId,
    staff_id: args.staffId,
    attendance_date: addDays(args.from, i),
    status: "ON_LEAVE",
    note: args.note,
  }));
  const { error } = await supabase
    .from("property_staff_attendance")
    .upsert(rows, { onConflict: "staff_id,attendance_date" });
  if (error) throw writeError(error, "We couldn't record this leave. Please try again.");
}

/** Clears ON_LEAVE marks from `from` (never before today) to `to`. */
export async function cancelStaffLeave(args: {
  propertyId: string;
  staffId: string;
  from: string;
  to: string;
}) {
  const { error } = await supabase
    .from("property_staff_attendance")
    .delete()
    .eq("property_id", args.propertyId)
    .eq("staff_id", args.staffId)
    .eq("status", "ON_LEAVE")
    .gte("attendance_date", args.from)
    .lte("attendance_date", args.to);
  if (error) throw writeError(error, "We couldn't cancel this leave. Please try again.");
}
