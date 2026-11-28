import { CalendarCheck } from "lucide-react";

import { DeltaPill } from "@/components/dashboard/admin/DashboardStatCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropertyAttendanceToday } from "@/lib/property-attendance";
import { cn } from "@/lib/utils";

/**
 * Wide KPI tile: today's attendance % ((Present + Late) / (Present + Late +
 * Absent), marked residents only) with a bar of that same %, the change vs
 * yesterday in percentage points, and how many active residents are present
 * or late (the Present tile beside it counts Present only).
 */
export function TodayAttendanceTile({
  today,
  isLoading,
  isError,
  onRetry,
  className,
}: {
  today?: PropertyAttendanceToday;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  const inCount = (today?.counts.PRESENT ?? 0) + (today?.counts.LATE ?? 0);
  const residents = today?.residents ?? 0;
  const pct = today?.pct ?? null;
  const notMarked = today?.counts.NOT_MARKED ?? 0;
  const delta = today?.deltaPp;

  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient",
        className,
      )}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center self-start rounded-xl bg-primary/10 text-primary sm:h-14 sm:w-14">
        <CalendarCheck className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">Today’s attendance</p>
        {isLoading ? (
          <div className="space-y-2 pt-1">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : isError || !today ? (
          <div className="pt-1 text-sm text-muted-foreground">
            Couldn’t load today’s attendance.{" "}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[28px]">
                {pct == null ? "—" : `${pct}%`}
              </p>
              {delta != null ? (
                <DeltaPill
                  delta={{
                    value: delta,
                    label: `${delta > 0 ? "+" : ""}${delta} pp`,
                    description: `vs yesterday (${today.yesterdayPct ?? 0}%)`,
                  }}
                />
              ) : null}
            </div>
            <p
              className="mt-0.5 truncate text-xs text-muted-foreground"
              title="Present + Late out of all active residents. The % counts marked residents only (Present + Late + Absent)."
            >
              <span className="font-medium text-foreground tabular-nums">
                {inCount.toLocaleString("en-IN")} / {residents.toLocaleString("en-IN")}
              </span>{" "}
              present or late
              {notMarked > 0 ? ` · ${notMarked.toLocaleString("en-IN")} not marked yet` : ""}
            </p>
            <div
              role="progressbar"
              aria-label="Today’s attendance of marked residents"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
              aria-valuetext={pct == null ? "Nobody marked yet" : `${pct}%`}
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success transition-[width] duration-500"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
