/**
 * Indian Standard Time helpers. Hostylia shows and accepts notice times in IST (Asia/Kolkata)
 * whatever the browser's own timezone is. Storage stays in the existing `timestamptz` columns as the
 * correct UTC instant; nothing here changes any database/server timezone.
 *
 * IST is UTC+05:30 all year (India has no daylight saving), so converting a wall-clock time typed by the
 * admin to an instant is exact. Never use `new Date("YYYY-MM-DDTHH:mm")` for that: it reads the string in
 * the BROWSER's timezone.
 */
export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The IST wall clock of an instant as "YYYY-MM-DDTHH:mm" (the value format of <input type="datetime-local">). */
export function isoToIstInput(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Interprets what the admin typed ("YYYY-MM-DDTHH:mm", from a datetime-local input) as IST and returns the
 * UTC ISO string to store/send. Returns null for empty or impossible values (e.g. 31 February).
 */
export function istInputToIso(value: string): string | null {
  const m = WALL_CLOCK.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}${IST_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // JavaScript rolls impossible dates over (31 Feb -> 3 Mar); reject them instead.
  if (isoToIstInput(date) !== `${y}-${mo}-${d}T${h}:${mi}`) return null;
  return date.toISOString();
}

/** "now" on the IST wall clock, for the `min` of a datetime-local input. */
export function nowIstInput(now: Date = new Date()): string {
  return isoToIstInput(now);
}

const displayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// Built from parts so the text is identical in every browser/ICU version ("17 Nov 2026, 3:30 pm").
function istParts(d: Date): Record<string, string> {
  const p: Record<string, string> = {};
  for (const part of displayFormatter.formatToParts(d)) p[part.type] = part.value;
  return p;
}

/** e.g. "17 Nov 2026, 3:30 pm IST" - always IST, whatever the viewer's timezone. */
export function formatIstDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toLowerCase()} IST`;
}

/** e.g. "17 Nov 2026" in IST. */
export function formatIstDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}`;
}
