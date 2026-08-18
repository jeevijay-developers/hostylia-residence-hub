import { Skeleton } from "@/components/ui/skeleton";

interface CardSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Generic card grid skeleton for dashboard/stats cards that don't fit the
 * rigid KPI grid pattern. Adapts to any grid layout via className override.
 * Use for flexible card layouts, 2-column grids, or irregular card sets.
 */
export function CardSkeleton({ count = 3, className }: CardSkeletonProps) {
  return (
    <div className={className ?? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
