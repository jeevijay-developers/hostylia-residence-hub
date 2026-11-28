import {
  Archive,
  Bell,
  CircleCheck,
  CircleX,
  Clock,
  DoorOpen,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** Pill background + text. */
  className: string;
  /** Solid swatch for chips and chart legends. */
  dot: string;
}

type StudentStatusKey =
  "APPLICANT" | "VERIFIED" | "ACTIVE" | "NOTICE_GIVEN" | "MOVED_OUT" | "REJECTED" | "ARCHIVED";

/**
 * One tone per student status, shared by the pill and the dot (directory filter
 * chips, status donut legend) so they always agree. ARCHIVED is the UI pseudo-status
 * for a soft-deleted record (students.deleted_at set), not a students.status value.
 */
const STUDENT_STATUS_META: Record<StudentStatusKey, StatusMeta> = {
  APPLICANT: { label: "Applicant", icon: Clock, className: "bg-info/10 text-info", dot: "bg-info" },
  VERIFIED: {
    label: "Verified",
    icon: ShieldCheck,
    className: "bg-chart-cat-2/10 text-chart-cat-2",
    dot: "bg-chart-cat-2",
  },
  ACTIVE: {
    label: "Active",
    icon: CircleCheck,
    className: "bg-success/10 text-success",
    dot: "bg-success",
  },
  NOTICE_GIVEN: {
    label: "Notice given",
    icon: Bell,
    className: "bg-warning/10 text-warning",
    dot: "bg-warning",
  },
  MOVED_OUT: {
    label: "Moved out",
    icon: DoorOpen,
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  REJECTED: {
    label: "Rejected",
    icon: CircleX,
    className: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  ARCHIVED: {
    label: "Archived",
    icon: Archive,
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

function studentStatusMeta(status: string): StatusMeta {
  if (Object.hasOwn(STUDENT_STATUS_META, status))
    return STUDENT_STATUS_META[status as StudentStatusKey];
  return {
    label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "),
    icon: Clock,
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
}

/** The status's solid swatch, for chips and chart legends that sit next to a text label. */
export function StudentStatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", studentStatusMeta(status).dot, className)}
      aria-hidden="true"
    />
  );
}

/** A student's lifecycle status as colour + icon + label (never colour alone). */
export function StudentStatusPill({ status, className }: { status: string; className?: string }) {
  const s = studentStatusMeta(status);
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

const AVATAR_TONES = [
  "bg-chart-cat-1/15 text-chart-cat-1",
  "bg-chart-cat-2/15 text-chart-cat-2",
  "bg-chart-cat-3/15 text-chart-cat-3",
  "bg-primary/10 text-primary",
];

function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** Initials in a tone derived from the student id, so a student keeps one colour everywhere. */
export function StudentAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
        avatarTone(id),
        className,
      )}
      aria-hidden="true"
    >
      {initials(name) || "?"}
    </span>
  );
}
