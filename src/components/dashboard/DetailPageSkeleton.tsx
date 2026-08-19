import { Skeleton } from "@/components/ui/skeleton";

interface DetailPageSkeletonProps {
  className?: string;
}

/**
 * Skeleton for detail/view pages that show a single resource (student profile,
 * complaint details, gate pass, etc.). Shows a large header area + stacked content blocks.
 */
export function DetailPageSkeleton({ className }: DetailPageSkeletonProps) {
  return (
    <div className={className ?? "space-y-6"}>
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      {/* Content sections */}
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="rounded-lg border border-border p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
