import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ComplaintCard } from "@/components/parent/ComplaintCard";
import { useComplaints } from "@/lib/complaint";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Parent read-only complaint view for one linked student.
 * RLS enforces the guardian link + `can_view_complaints` — this component
 * simply fetches; if the guardian flag is off, the parent page frame
 * hides the section entirely (per `requirePermission`).
 */
export function ComplaintTrackerList({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const q = useComplaints({ studentId });

  if (q.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  const list = q.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title={t("parent.complaints.emptyTitle")}
        description={t("parent.complaints.emptyBody")}
      />
    );
  }
  return (
    <div className="space-y-3">
      {list.map((c) => (
        <ComplaintCard key={c.id} complaint={c} />
      ))}
    </div>
  );
}
