import { Skeleton } from "@/components/ui/skeleton";

interface FormSkeletonProps {
  fields?: number;
  className?: string;
}

/**
 * Skeleton for form/detail pages with stacked label-input pairs. Matches
 * typical form field height (~50px) to avoid layout shift when real form appears.
 * Use for edit forms, user profile pages, settings, etc.
 */
export function FormSkeleton({ fields = 6, className }: FormSkeletonProps) {
  return (
    <div className={className ?? "space-y-6"}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
