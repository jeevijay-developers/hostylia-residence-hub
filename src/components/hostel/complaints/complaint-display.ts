import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Armchair,
  CheckCircle2,
  CircleDot,
  Clock,
  Droplets,
  Flame,
  Hourglass,
  Loader,
  Lock,
  Minus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Tag,
  UserCheck,
  UtensilsCrossed,
  Wifi,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useCanOverrideReopen } from "@/lib/complaint";
import type { PropertyComplaint, SlaTone } from "@/lib/property-complaints";
import { COMPLAINT_STATUS_TRANSITIONS, type ComplaintStatus } from "@/schemas/complaint";

/** Display metadata (labels, icons, semantic tones) shared by the property Complaints tab. */

export const STATUS_META: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  OPEN: { label: "Open", icon: CircleDot, className: "bg-info/10 text-info" },
  REOPENED: { label: "Reopened", icon: RotateCcw, className: "bg-warning/10 text-warning" },
  WAITING_FOR_STUDENT: {
    label: "Waiting for student",
    icon: Hourglass,
    className: "bg-warning/10 text-warning",
  },
  ASSIGNED: { label: "Assigned", icon: UserCheck, className: "bg-chart-cat-2/10 text-chart-cat-2" },
  IN_PROGRESS: {
    label: "In progress",
    icon: Loader,
    className: "bg-chart-cat-1/10 text-chart-cat-1",
  },
  RESOLVED: { label: "Resolved", icon: CheckCircle2, className: "bg-success/10 text-success" },
  CLOSED: { label: "Closed", icon: Lock, className: "bg-muted text-muted-foreground" },
  CANCELLED: { label: "Cancelled", icon: XCircle, className: "bg-muted text-muted-foreground" },
};

export function statusLabel(status: string) {
  return STATUS_META[status]?.label ?? status.replaceAll("_", " ").toLowerCase();
}

export const PRIORITY_META: Record<string, { label: string; icon: LucideIcon; className: string }> =
  {
    URGENT: { label: "Urgent", icon: Flame, className: "bg-destructive/10 text-destructive" },
    HIGH: { label: "High", icon: ArrowUp, className: "bg-warning/10 text-warning" },
    MEDIUM: { label: "Medium", icon: Minus, className: "bg-info/10 text-info" },
    LOW: { label: "Low", icon: ArrowDown, className: "bg-muted text-muted-foreground" },
  };

/** Icon for a category by its (admin-editable) name; anything unrecognised gets a tag. */
export function categoryIcon(name: string | null | undefined): LucideIcon {
  const n = (name ?? "").toLowerCase();
  if (/wi-?fi|internet|network/.test(n)) return Wifi;
  if (/plumb|water|tap|drain/.test(n)) return Droplets;
  if (/electric|power|light/.test(n)) return Zap;
  if (/mess|food|kitchen/.test(n)) return UtensilsCrossed;
  if (/furniture|bed|chair|cupboard/.test(n)) return Armchair;
  if (/clean|hygiene|housekeep|pest/.test(n)) return Sparkles;
  if (/secur|safety|gate|lock/.test(n)) return ShieldAlert;
  return Tag;
}

export const SLA_TONE: Record<
  SlaTone,
  { icon: LucideIcon; className: string; text: string; accent: string }
> = {
  ok: {
    icon: Clock,
    className: "bg-success/10 text-success",
    text: "text-success",
    accent: "border-l-success",
  },
  warn: {
    icon: Clock,
    className: "bg-warning/10 text-warning",
    text: "text-warning",
    accent: "border-l-warning",
  },
  breach: {
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive",
    text: "text-destructive",
    accent: "border-l-destructive",
  },
  done: {
    icon: CheckCircle2,
    className: "text-success",
    text: "text-success",
    accent: "border-l-success",
  },
  muted: {
    icon: XCircle,
    className: "text-muted-foreground",
    text: "text-muted-foreground",
    accent: "border-l-border",
  },
};

export type StatusTarget = "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "REOPENED";

/**
 * Status moves an Admin can make from a complaint's current status — the workflow's transitions
 * (CLOSED is the system's job), plus the reopen override when the Admin holds that permission.
 */
export function useStatusTargets(complaint: PropertyComplaint): StatusTarget[] {
  const canOverrideQ = useCanOverrideReopen(complaint);
  return useMemo(() => {
    const next = (COMPLAINT_STATUS_TRANSITIONS[complaint.status as ComplaintStatus] ?? []).filter(
      (s): s is StatusTarget => s === "ASSIGNED" || s === "IN_PROGRESS" || s === "RESOLVED",
    );
    const canReopen =
      (complaint.status === "RESOLVED" || complaint.status === "CLOSED") &&
      canOverrideQ.data === true;
    return canReopen ? [...next, "REOPENED"] : next;
  }, [complaint.status, canOverrideQ.data]);
}

export const TARGET_LABEL: Record<StatusTarget, string> = {
  ASSIGNED: "Assign to a warden",
  IN_PROGRESS: "Start working (In progress)",
  RESOLVED: "Resolve",
  REOPENED: "Reopen (override)",
};
