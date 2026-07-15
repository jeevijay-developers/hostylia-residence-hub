import { cn } from "@/lib/utils";
import { slaMeta, type ComplaintRow } from "@/lib/complaint";

/**
 * Semantic status colours only — never brand teal.
 * Uses Design.md semantic tokens (success / warning / destructive / muted).
 */
export function SlaBadge({ complaint }: { complaint: ComplaintRow }) {
  const m = slaMeta(complaint);
  const tone =
    m.tone === "breach"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : m.tone === "warn"
        ? "bg-warning/15 text-warning border-warning/30"
        : m.tone === "done"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-success/15 text-success border-success/30";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {m.label}
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
