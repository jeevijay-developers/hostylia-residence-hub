/**
 * Derived, UI-only "is this subscription's current period ending soon"
 * signal — reused by Super Admin Billing (per-row indicator) and the
 * Dashboard (aggregate alert counts) so the threshold/logic lives in one
 * place. This never writes a new status to the DB — the existing
 * TRIAL/ACTIVE/PAST_DUE/PAUSED/CANCELLED model is untouched; "ending soon" /
 * "ends today" / "ended" are computed client-side from the already-stored
 * `current_period_end` (or `trial_ends_at` for TRIAL) against the current
 * time, every time the page renders.
 */
export const ENDING_SOON_THRESHOLD_DAYS = 7;

export type ExpiryIndicator = "ENDING_SOON" | "ENDS_TODAY" | "ENDED" | null;

export function daysRemaining(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const endOfDay = new Date(dateIso);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((endOfDay.getTime() - now.getTime()) / msPerDay);
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
