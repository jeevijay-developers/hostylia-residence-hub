const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Clock time ("09:05 pm") of a gate event in the PROPERTY's timezone, used in late-entry messages. A missing,
 * blank or invalid timezone name falls back to Asia/Kolkata (the same fallback as fn_check_gatepass_curfew),
 * and it never throws, so a bad property setting can not drop the notification.
 */
export function formatGateTime(at: Date, timezone?: string | null): string {
  const zone = timezone?.trim() || DEFAULT_TIMEZONE;
  const format = (timeZone: string) =>
    at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone });
  try {
    return format(zone);
  } catch {
    return format(DEFAULT_TIMEZONE);
  }
}
