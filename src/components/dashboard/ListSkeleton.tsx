import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * For card-row list pages (complaints, notices, gate/visitor logs, payment
 * history) that render a stack of bordered rows rather than a `<Table>` —
 * mirrors that shape (title line + meta line, in a bordered card) instead of
 * one full-width block, matching `TableSkeleton`'s per-item granularity for
 * this different layout.
 */
export function ListSkeleton({ rows = 5, className }: ListSkeletonProps) {
  return (
    <div className={className ?? "space-y-2"}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-md border border-border bg-card p-3"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}
