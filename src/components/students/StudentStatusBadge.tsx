import { Badge } from "@/components/ui/badge";

const COLORS: Record<string, string> = {
  APPLICANT: "bg-muted text-muted-foreground",
  VERIFIED: "bg-primary/15 text-primary",
  ACTIVE: "bg-bed-occupied/15 text-bed-occupied",
  NOTICE_GIVEN: "bg-bed-maintenance/15 text-bed-maintenance",
  MOVED_OUT: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
  REJECTED: "bg-bed-blocked/15 text-bed-blocked",
};

export function StudentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full ${COLORS[status] ?? ""}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
