import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { useComplaints } from "@/lib/complaint";
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

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
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
