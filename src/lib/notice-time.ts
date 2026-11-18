/**
 * Notice lifecycle in time: when is a notice still "active", and what status should the UI show?
 *
 * The database flips PUBLISHED -> EXPIRED with a scheduled job (fn_expire_notices), which runs every few
 * minutes. These helpers make the UI correct in between: a notice whose `expires_at` has passed is
 * treated as expired immediately, never offered as active.
 */
import { useEffect, useState } from "react";

interface NoticeTimes {
  status: string;
  expires_at: string | null;
}

/** True when `expires_at` is set and is at or before `now` (same `<=` rule as the database job). */
export function hasNoticeExpired(
  notice: Pick<NoticeTimes, "expires_at">,
  now: number = Date.now(),
): boolean {
  if (!notice.expires_at) return false;
  const t = new Date(notice.expires_at).getTime();
  return !Number.isNaN(t) && t <= now;
}

/** Shown status: a PUBLISHED notice past its expiry reads EXPIRED even before the job has recorded it. */
export function effectiveNoticeStatus(notice: NoticeTimes, now: number = Date.now()): string {
  return notice.status === "PUBLISHED" && hasNoticeExpired(notice, now) ? "EXPIRED" : notice.status;
}

/** Recipient feeds: only PUBLISHED notices that have not expired. */
export function isNoticeActive(notice: NoticeTimes, now: number = Date.now()): boolean {
  return effectiveNoticeStatus(notice, now) === "PUBLISHED";
}

/** Current time that refreshes every `ms`, so a notice disappears at its expiry without a page reload. */
export function useNowTick(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
