import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";

// TODO(Phase 11): swap the empty state for a real fetch of the `attendance`
// table (per-student, per-day). Query shape lives in this component so Phase 11
// only needs to plug in a `useQuery` here — do not rebuild.
export function AttendanceHistoryList(_props: { studentId: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t("parent.attendance.emptyTitle")}
      description={t("parent.attendance.emptyBody")}
    />
  );
}
