import type { SemanticTone } from "@/lib/utils";

/**
 * Shared Admin + Warden attendance rules.
 *   - PRESENT / ABSENT / LATE are the only statuses marked by hand.
 *   - ON_LEAVE is derived from an approved leave request (never selectable).
 *   - Percentage (computed in v_attendance_monthly_summary, not here):
 *     (Present + Late) / (Present + Late + Absent) × 100 — leave excluded from
 *     both sides; Late is still reported on its own.
 */
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "ON_LEAVE";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  ON_LEAVE: "On Leave",
};

export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, SemanticTone> = {
  PRESENT: "success",
  ABSENT: "destructive",
  LATE: "warning",
  ON_LEAVE: "info",
};

/** Every status, for display and filtering. */
export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[];

/** Statuses a staff member may select; On Leave is never among them. */
export const MANUAL_ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE"];

export interface AttendanceSummary extends Record<AttendanceStatus, number> {
  total: number;
}

/**
 * Day summary for a property. Saved rows (all pages) count by their status —
 * unsaved overrides applied on top — then roster students without a row use
 * their effective status, and anyone left uncounted defaults to Present (the
 * same default the roster shows). Approved-leave students arrive as ON_LEAVE
 * through their saved row / `effective`.
 */
export function summarizeAttendance({
  rows,
  overrides,
  roster,
  effective,
  studentTotal,
}: {
  rows: { student_id: string; status: string }[];
  overrides: Record<string, AttendanceStatus>;
  roster: { id: string }[];
  effective: (studentId: string) => AttendanceStatus;
  studentTotal: number;
}): AttendanceSummary {
  const counts: Record<AttendanceStatus, number> = {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    ON_LEAVE: 0,
  };
  const seen = new Set<string>();
  for (const a of rows) {
    const status = (overrides[a.student_id] ?? a.status) as AttendanceStatus;
    if (status in counts) counts[status] += 1;
    seen.add(a.student_id);
  }
  for (const s of roster) {
    if (seen.has(s.id)) continue;
    counts[effective(s.id)] += 1;
    seen.add(s.id);
  }
  counts.PRESENT += Math.max(0, studentTotal - seen.size);
  return { total: studentTotal, ...counts };
}
