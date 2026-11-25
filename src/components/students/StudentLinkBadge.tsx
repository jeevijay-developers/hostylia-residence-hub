import { Link2, Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Account-link status, derived solely from students.profile_id so the Admin and
 * Warden dashboards can never disagree. Icon + label (never colour alone).
 */
export function StudentLinkBadge({
  isLinked,
  className,
}: {
  isLinked: boolean;
  className?: string;
}) {
  const Icon = isLinked ? Link2 : Link2Off;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isLinked
          ? "border-success/30 bg-success/15 text-success"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isLinked ? "Linked" : "Not linked"}
    </Badge>
  );
}
