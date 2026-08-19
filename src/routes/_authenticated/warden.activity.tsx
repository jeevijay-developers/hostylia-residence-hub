import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { ActivityIcon } from "@/components/warden/ActivityIcon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useRecentActivity } from "@/lib/warden-activity";

export const Route = createFileRoute("/_authenticated/warden/activity")({
  head: () => ({ meta: [{ title: "Recent Activity — Hostylia" }] }),
  component: WardenActivityPage,
});

function WardenActivityPage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const { items, isLoading } = useRecentActivity(propertyId);

  return (
    <div className="space-y-5 pb-3">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/warden/daily-brief">
          <ArrowLeft className="h-4 w-4" /> Back to brief
        </Link>
      </Button>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && <EmptyState title="No activity yet today." />}

      {!isLoading && items.length > 0 && (
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
            >
              <ActivityIcon type={item.type} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.type}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(item.at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
