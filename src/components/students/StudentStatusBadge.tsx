import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Semantic status tokens only — mirrors the tone system used by SlaBadge/InvoiceStatusPill. */
const COLORS: Record<string, string> = {
  APPLICANT: "bg-muted text-muted-foreground border-border",
  VERIFIED: "bg-info/15 text-info border-info/30",
  ACTIVE: "bg-success/15 text-success border-success/30",
  NOTICE_GIVEN: "bg-warning/15 text-warning border-warning/30",
  MOVED_OUT: "bg-muted text-muted-foreground border-border",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StudentStatusBadge({ status, className }: { status: string; className?: string }) {
  const isPulse = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm",
        COLORS[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", isPulse && "animate-pulse")} />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

