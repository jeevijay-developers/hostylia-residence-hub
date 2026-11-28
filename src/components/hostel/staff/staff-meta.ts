import {
  Calculator,
  HandHelping,
  Shield,
  ShieldCheck,
  SprayCan,
  UserRound,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { StaffDesignation } from "@/lib/property-staff";

/** Non-component helpers for the Staff tab (kept apart for React fast refresh). */

export const DESIGNATION_ICON: Record<StaffDesignation, LucideIcon> = {
  WARDEN: ShieldCheck,
  ACCOUNTANT: Calculator,
  CARETAKER: HandHelping,
  SECURITY: Shield,
  HOUSEKEEPING: SprayCan,
  MESS_MANAGER: Utensils,
  MAINTENANCE: Wrench,
  OTHER: UserRound,
};

const AVATAR_TONES = [
  "bg-chart-cat-1/15 text-chart-cat-1",
  "bg-chart-cat-2/15 text-chart-cat-2",
  "bg-chart-cat-3/15 text-chart-cat-3",
  "bg-primary/10 text-primary",
];

export function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export const fmtStaffDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const WORK_AREA_SUGGESTIONS = [
  "All Blocks",
  "Office",
  "Main Gate",
  "Mess",
  "Kitchen",
  "Reception",
  "Laundry",
];

/** Zod issues → first message per top-level field. */
export function issuesToErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Form field → input id suffix (ids are `${prefix}-${suffix}`), in on-screen order. */
const FIELD_INPUT: [field: string, suffix: string][] = [
  ["staff_id", "staff"],
  ["full_name", "name"],
  ["phone", "phone"],
  ["email", "email"],
  ["work_area", "area"],
  ["shift_name", "shift"],
  ["shift_start", "start"],
  ["shift_end", "end"],
  ["joined_on", "joined"],
  ["from", "from"],
  ["to", "to"],
  ["note", "note"],
  ["notes", "notes"],
];

/** Focuses (and scrolls to) the first field with an error. */
export function focusFirstError(prefix: string, errors: Record<string, string>) {
  const hit = FIELD_INPUT.find(([field]) => errors[field]);
  if (hit) document.getElementById(`${prefix}-${hit[1]}`)?.focus();
}

/** "08:00:00" → "08:00" for <input type="time">. */
export const timeForInput = (t: string | null) => (t ? t.slice(0, 5) : "");
