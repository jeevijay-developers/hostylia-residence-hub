import { cn } from "@/lib/utils";
import { slaMeta, type ComplaintRow } from "@/lib/complaint";
import type { ComplaintPriority } from "@/schemas/complaint";

type SlaTone = ReturnType<typeof slaMeta>["tone"];

/** SLA tone → semantic token, shared by the card's left accent bar and this badge. */
export function slaToneClasses(tone: SlaTone, status: string) {
  if (tone === "breach") return "bg-destructive/15 text-destructive border-destructive/30";
  if (tone === "warn") return "bg-warning/15 text-warning border-warning/30";
  if (tone === "done") {
    // A cancelled complaint didn't resolve successfully — keep it neutral, not "success" green.
    return status === "CANCELLED"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-success/15 text-success border-success/30";
  }
  return "bg-info/15 text-info border-info/30";
}

/** Same tone mapping as a `border-l-*` class, for the complaint card's accent bar. */
export function slaAccentBorderClass(tone: SlaTone, status: string) {
  if (tone === "breach") return "border-l-destructive";
  if (tone === "warn") return "border-l-warning";
  if (tone === "done") return status === "CANCELLED" ? "border-l-border" : "border-l-success";
  return "border-l-info";
}

/**
 * Semantic status colours only — never brand teal.
 * Uses Design.md semantic tokens (success / warning / destructive / info / muted).
 */
export function SlaBadge({ complaint }: { complaint: ComplaintRow }) {
  const m = slaMeta(complaint);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        slaToneClasses(m.tone, complaint.status),
      )}
    >
      {m.label}
    </span>
  );
}

const PRIORITY_TEXT_TONE: Record<ComplaintPriority, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-info",
  HIGH: "text-warning",
  URGENT: "text-destructive",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold",
        PRIORITY_TEXT_TONE[priority as ComplaintPriority] ?? "text-muted-foreground",
      )}
    >
      {priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: "bg-muted text-muted-foreground border-border",
    ASSIGNED: "bg-primary/10 text-primary border-primary/30",
    IN_PROGRESS: "bg-primary/10 text-primary border-primary/30",
    WAITING_FOR_STUDENT: "bg-warning/15 text-warning border-warning/30",
    RESOLVED: "bg-success/15 text-success border-success/30",
    CLOSED: "bg-muted text-muted-foreground border-border",
    REOPENED: "bg-warning/15 text-warning border-warning/30",
    CANCELLED: "bg-muted text-muted-foreground border-border line-through",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[status] ?? "bg-muted",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
