import { isoToIstInput } from "@/lib/ist";

/**
 * Derived, UI-only "is this subscription's current period ending soon"
 * signal — reused by Super Admin Billing (per-row indicator) and the
 * Dashboard (aggregate alert counts) so the threshold/logic lives in one
 * place. This never writes a new status to the DB — the existing
 * TRIAL/ACTIVE/PAST_DUE/PAUSED/CANCELLED model is untouched; "ending soon" /
 * "ends today" / "ended" are computed client-side from the already-stored
 * `current_period_end` (or `trial_ends_at` for TRIAL) against the current
 * time, every time the page renders.
 *
 * Day counts compare Indian Standard Time calendar dates (see ist.ts), not raw
 * 24-hour blocks, so the last day reads "ends today", never "1 day".
 */
export const ENDING_SOON_THRESHOLD_DAYS = 7;

export type ExpiryIndicator = "ENDING_SOON" | "ENDS_TODAY" | "ENDED" | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The IST calendar date of an instant, as a whole-day number (days since the Unix epoch). */
function istDayNumber(d: Date): number | null {
  const ymd = isoToIstInput(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

/**
 * Whole IST calendar days from today to the end date: 0 = the end falls later
 * today, 1 = tomorrow, and so on. Negative once the end instant has passed
 * (even earlier the same day), so the caller sees ENDED rather than "ends
 * today" for a plan that has already run out. Null for a missing/invalid date.
 */
export function daysRemaining(dateIso: string | null, now: Date = new Date()): number | null {
  if (!dateIso) return null;
  const end = new Date(dateIso);
  if (Number.isNaN(end.getTime())) return null;
  const endDay = istDayNumber(end);
  const today = istDayNumber(now);
  if (endDay == null || today == null) return null;
  const days = endDay - today;
  if (end.getTime() <= now.getTime()) return Math.min(days, -1);
  return days;
}

/** The date that determines this subscription's "ending soon" state — trial_ends_at for TRIAL, current_period_end otherwise. */
export function relevantEndDate(sub: {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}): string | null {
  return sub.status === "TRIAL" ? sub.trial_ends_at : sub.current_period_end;
}

/** CANCELLED subscriptions are already ended by definition — no indicator needed. */
export function getExpiryIndicator(status: string, days: number | null): ExpiryIndicator {
  if (days == null || status === "CANCELLED") return null;
  if (days < 0) return "ENDED";
  if (days === 0) return "ENDS_TODAY";
  if (days <= ENDING_SOON_THRESHOLD_DAYS) return "ENDING_SOON";
  return null;
}

export function formatRemaining(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return "Ended";
  if (days === 0) return "Ends today";
  return days === 1 ? "1 day" : `${days} days`;
}
