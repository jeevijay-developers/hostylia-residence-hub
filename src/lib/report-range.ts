/**
 * Reporting period helpers for Admin Reports (DSO & Aging) and the overdue-invoice drill-down.
 *
 * A period is an inclusive pair of plain calendar dates ("YYYY-MM-DD") compared against invoices.issue_date
 * (a `date` column), so no timezone conversion is involved in filtering. Only the DEFAULT ("the current
 * month") needs "today", and that is the Indian date (IST), like every other date in the app.
 */
import { z } from "zod";
import { todayIst } from "@/lib/schedule-picker";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in "YYYY-MM-DD" form (rejects 2026-02-31 and malformed text). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const isoDateSchema = z.string().refine(isValidIsoDate, "Enter a valid date (YYYY-MM-DD)");

/** Both ends optional (open-ended); when both are present `from` must not be after `to`. */
export function isRangeValid(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (from && !isValidIsoDate(from)) return false;
  if (to && !isValidIsoDate(to)) return false;
  return !from || !to || from <= to;
}

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The whole calendar month containing today (IST): the report's default period. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  const [y, m] = todayIst(now).split("-").map(Number);
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDayOf(y, m)) };
}

/** The whole calendar month before the current one (IST). */
export function lastMonthRange(now: Date = new Date()): DateRange {
  const [y, m] = todayIst(now).split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDayOf(py, pm)) };
}

/** Today only (IST). */
export function todayRange(now: Date = new Date()): DateRange {
  const t = todayIst(now);
  return { from: t, to: t };
}

/** Monday through today (IST) — a partial week stays partial, it never runs into the future. */
export function thisWeekRange(now: Date = new Date()): DateRange {
  const t = todayIst(now);
  const [y, m, d] = t.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(y, m - 1, d - mondayOffset));
  return {
    from: ymd(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    to: t,
  };
}

/** 1 Jan through today of the current year (IST). */
export function thisYearRange(now: Date = new Date()): DateRange {
  const t = todayIst(now);
  const [y] = t.split("-").map(Number);
  return { from: ymd(y, 1, 1), to: t };
}

/** Which of the offered periods a range is: "Current month", "Previous month" or "Custom range". */
export function describeRange(range: DateRange, now: Date = new Date()): string {
  const same = (r: DateRange) => r.from === range.from && r.to === range.to;
  if (same(currentMonthRange(now))) return "Current month";
  if (same(lastMonthRange(now))) return "Previous month";
  return "Custom range";
}

/** Same idea as describeRange, but across the full Finance Overview preset set. */
export function describeFinanceRange(range: DateRange, now: Date = new Date()): string {
  const same = (r: DateRange) => r.from === range.from && r.to === range.to;
  if (same(todayRange(now))) return "Today";
  if (same(thisWeekRange(now))) return "This week";
  if (same(currentMonthRange(now))) return "This month";
  if (same(lastMonthRange(now))) return "Last month";
  if (same(thisYearRange(now))) return "This year";
  return "Custom range";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "17 Nov 2026" for a "YYYY-MM-DD" date (timezone-independent). */
export function formatIsoDate(value: string): string {
  if (!isValidIsoDate(value)) return value;
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatRange(range: DateRange): string {
  return range.from === range.to
    ? formatIsoDate(range.from)
    : `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`;
}

/**
 * Search params of the overdue-invoice list (/admin/finance/invoices): the report's "Overdue Invoices" card
 * opens it with the same period it was counted for. An invalid or reversed date range is dropped.
 */
export const invoiceScopeSearchSchema = z
  .object({
    scope: z.literal("overdue").optional().catch(undefined),
    // Deep link that opens the Create invoice dialog (e.g. the property Finance tab).
    create: z.boolean().optional().catch(undefined),
    from: isoDateSchema.optional().catch(undefined),
    to: isoDateSchema.optional().catch(undefined),
  })
  .transform((s) => (isRangeValid(s.from, s.to) ? s : { ...s, from: undefined, to: undefined }));
export type InvoiceScopeSearch = z.infer<typeof invoiceScopeSearchSchema>;
