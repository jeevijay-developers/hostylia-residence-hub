/**
 * Pure logic behind the Notice Composer's schedule picker (date + time, IST).
 *
 * Values are IST wall-clock strings "YYYY-MM-DDTHH:mm" - the same format the composer already keeps in
 * state and converts with istInputToIso(). Nothing here reads the browser's timezone: "now" comes from
 * nowIstInput(), and calendar days are handled as plain "YYYY-MM-DD" strings.
 *
 * Minutes are offered in 5-minute steps (the scheduled publisher polls every 5 minutes anyway).
 */
import { nowIstInput } from "@/lib/ist";

/**
 * What "now" means for the picker: a real instant, or an IST wall-clock string used directly as the
 * earliest-allowed moment (slots at or before it cannot be chosen). The string form lets the Expires
 * picker require "after the scheduled publish time" with exactly the same rules as "after now".
 */
export type Clock = Date | string;

function clockToIst(clock: Clock): string {
  return typeof clock === "string" ? clock : nowIstInput(clock);
}

/** The effective lower bound: the later of "now" and an optional IST value ("" / invalid are ignored). */
export function floorClock(now: Date, notBefore?: string): Clock {
  const current = nowIstInput(now);
  return notBefore && VALUE.test(notBefore) && notBefore > current ? notBefore : now;
}

export const MINUTE_STEP = 5;
export const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
export type Period = "AM" | "PM";

export interface PickerValue {
  /** "YYYY-MM-DD" */
  date: string;
  hour24: number;
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const VALUE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export function parsePickerValue(value: string): PickerValue | null {
  const m = VALUE.exec(value);
  if (!m) return null;
  const hour24 = Number(m[2]);
  const minute = Number(m[3]);
  if (hour24 > 23 || minute > 59) return null;
  return { date: m[1], hour24, minute };
}

export function buildPickerValue(v: PickerValue): string {
  return `${v.date}T${pad(v.hour24)}:${pad(v.minute)}`;
}

export function to12Hour(hour24: number): { hour12: number; period: Period } {
  return { hour12: hour24 % 12 === 0 ? 12 : hour24 % 12, period: hour24 >= 12 ? "PM" : "AM" };
}

export function to24Hour(hour12: number, period: Period): number {
  return (hour12 % 12) + (period === "PM" ? 12 : 0);
}

/** A calendar day (local-midnight Date from the calendar widget) as "YYYY-MM-DD". Only y/m/d are used. */
export function ymd(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** "YYYY-MM-DD" back to a local-midnight Date for the calendar widget. */
export function dayFromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today's date in IST. */
export function todayIst(now: Clock = new Date()): string {
  return clockToIst(now).slice(0, 10);
}

/** True when the slot is not strictly after the current IST minute (so it cannot be scheduled). */
export function isSlotPast(v: PickerValue, now: Clock = new Date()): boolean {
  return buildPickerValue(v) <= clockToIst(now);
}

/** The first 5-minute slot strictly after "now" (IST); may fall on the next day. */
export function nextSlotAfter(now: Clock = new Date()): PickerValue {
  const cur = clockToIst(now); // "YYYY-MM-DDTHH:mm"
  const date = cur.slice(0, 10);
  const total = Number(cur.slice(11, 13)) * 60 + Number(cur.slice(14, 16));
  const next = (Math.floor(total / MINUTE_STEP) + 1) * MINUTE_STEP;
  if (next >= 24 * 60) {
    const d = dayFromYmd(date);
    d.setDate(d.getDate() + 1);
    return { date: ymd(d), hour24: 0, minute: 0 };
  }
  return { date, hour24: Math.floor(next / 60), minute: next % 60 };
}

/** Is any slot still available on this day (IST)? False for past days and for a day whose last slot is gone. */
export function isDayDisabled(date: string, now: Clock = new Date()): boolean {
  const today = todayIst(now);
  if (date < today) return true;
  if (date > today) return false;
  return isSlotPast({ date, hour24: 23, minute: 60 - MINUTE_STEP }, now);
}

/** Time to pre-fill when a date is first chosen: 9:00 am on a future day, the next free slot today. */
export function defaultTimeFor(date: string, now: Clock = new Date()): PickerValue {
  const nine: PickerValue = { date, hour24: 9, minute: 0 };
  return isSlotPast(nine, now) ? nextSlotAfter(now) : nine;
}

/** Keeps a chosen slot valid: if it is in the past (today), moves it to the next free slot. */
export function clampToFuture(v: PickerValue, now: Clock = new Date()): PickerValue {
  return isSlotPast(v, now) ? nextSlotAfter(now) : v;
}

/** An hour is selectable on `date` for `period` if at least one of its minutes is still in the future. */
export function isHourDisabled(
  date: string,
  hour12: number,
  period: Period,
  now: Clock = new Date(),
): boolean {
  return isSlotPast({ date, hour24: to24Hour(hour12, period), minute: 60 - MINUTE_STEP }, now);
}

export function isMinuteDisabled(
  date: string,
  hour12: number,
  period: Period,
  minute: number,
  now: Clock = new Date(),
): boolean {
  return isSlotPast({ date, hour24: to24Hour(hour12, period), minute }, now);
}

/** AM / PM is selectable if its last slot of the day is still in the future. */
export function isPeriodDisabled(date: string, period: Period, now: Clock = new Date()): boolean {
  return isSlotPast({ date, hour24: period === "AM" ? 11 : 23, minute: 60 - MINUTE_STEP }, now);
}

/** Minute choices for the dropdown: the 5-minute grid, plus the current value if it is off the grid. */
export function minuteChoices(current: number): number[] {
  return MINUTES.includes(current) ? MINUTES : [...MINUTES, current].sort((a, b) => a - b);
}
