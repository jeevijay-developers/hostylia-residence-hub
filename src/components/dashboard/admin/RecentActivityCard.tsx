import { formatDistanceToNowStrict } from "date-fns";
import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityIcon } from "@/components/warden/ActivityIcon";
import type { ActivityItem } from "@/lib/admin-activity";

const MAX_ITEMS = 4;
const SIMULATED_SUFFIX = " (SIMULATED — test payment)";

function relative(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return "Just now";
  return formatDistanceToNowStrict(d, { addSuffix: true })
    .replace(/ minutes?/, " min")
    .replace(/ hours?/, " hr");
}

/** Timeline of the latest property activity (sources merged in useAdminRecentActivity). */
export function RecentActivityCard({
  items,
  isLoading,
}: {
  items: ActivityItem[];
  isLoading?: boolean;
}) {
  const visible = items.slice(0, MAX_ITEMS);
  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: MAX_ITEMS }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <ol className="relative space-y-2 pl-5">
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-[5px] top-3 w-px bg-border"
            />
            {visible.map((item, i) => (
              <li key={`${item.type}-${item.at}-${i}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-5 top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2 border-card bg-primary/70 ring-1 ring-primary/20"
                />
                <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2">
                  <ActivityIcon type={item.type} />
                  {/* One line per row (type · detail); the full detail stays in the tooltip. */}
                  <p
                    className="min-w-0 flex-1 truncate text-sm leading-tight"
                    title={item.detail ? `${item.type} — ${item.detail}` : item.type}
                  >
                    <span className="font-medium text-foreground">{item.type}</span>
                    {item.detail ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {item.detail.replace(SIMULATED_SUFFIX, "")}
                      </span>
                    ) : null}
                  </p>
                  {item.detail?.includes(SIMULATED_SUFFIX) ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Test
                    </span>
                  ) : null}
                  <time
                    dateTime={item.at}
                    title={new Date(item.at).toLocaleString()}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {relative(item.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
