import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";

// TODO(Phase 7): swap the empty state for a real fetch of the `complaints`
// table (scoped to this student). Kept as a stub so Phase 7 only needs to plug
// in `useQuery` here — do not rebuild.
export function ComplaintTrackerList(_props: { studentId: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t("parent.complaints.emptyTitle")}
      description={t("parent.complaints.emptyBody")}
    />
  );
}
