import { CalendarDays, Clock, UserCheck, Users, UserX, type LucideIcon } from "lucide-react";

import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  type AttendanceStatus,
  type AttendanceSummary,
} from "@/lib/attendance-status";
import { cn, toneClasses, toneTextClasses, type SemanticTone } from "@/lib/utils";

export const ATTENDANCE_STATUS_ICON: Record<AttendanceStatus, LucideIcon> = {
  PRESENT: UserCheck,
  ABSENT: UserX,
  LATE: Clock,
  ON_LEAVE: CalendarDays,
};

/** Status + icon pill (never colour alone) — used on student records. */
export function AttendanceStatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  const Icon = ATTENDANCE_STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        toneClasses[ATTENDANCE_STATUS_TONE[status]],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {ATTENDANCE_STATUS_LABEL[status]}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: SemanticTone;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-4", toneClasses[tone])}>
      <svg
        aria-hidden="true"
        viewBox="0 0 120 40"
        preserveAspectRatio="none"
        className={cn("absolute inset-x-0 bottom-0 h-10 w-full opacity-30", toneTextClasses[tone])}
      >
        <path
          d="M0 28 C 15 16, 30 36, 45 24 S 75 12, 90 26 S 110 32, 120 20 L 120 40 L 0 40 Z"
          fill="currentColor"
        />
      </svg>
      <div className="relative flex items-center justify-between gap-2">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card",
            toneTextClasses[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-3 text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("relative font-display text-3xl font-bold", toneTextClasses[tone])}>
        {value}
      </p>
    </div>
  );
}

/** Identical Admin + Warden day summary: Total, Present, Absent, Late, On Leave. */
export function AttendanceSummaryCards({ summary }: { summary: AttendanceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryCard icon={Users} label="Total Students" value={summary.total} tone="primary" />
      {(["PRESENT", "ABSENT", "LATE", "ON_LEAVE"] as const).map((s) => (
        <SummaryCard
          key={s}
          icon={ATTENDANCE_STATUS_ICON[s]}
          label={ATTENDANCE_STATUS_LABEL[s]}
          value={summary[s]}
          tone={ATTENDANCE_STATUS_TONE[s]}
        />
      ))}
    </div>
  );
}
