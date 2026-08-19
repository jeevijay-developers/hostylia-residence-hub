import { Skeleton } from "@/components/ui/skeleton";

interface KpiGridSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Fallback for dashboard KPI rows that don't render via `<KpiCard loading>`
 * per-card (that prop already covers the common case — see KpiCard.tsx) but
 * instead gate the whole row behind one query's `isLoading`. Matches
 * KpiCard's own footprint (rounded-2xl card, ~132px tall) so swapping in the
 * real cards once data arrives doesn't shift layout.
 */
export function KpiGridSkeleton({ count = 4, className }: KpiGridSkeletonProps) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
          <Skeleton className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
