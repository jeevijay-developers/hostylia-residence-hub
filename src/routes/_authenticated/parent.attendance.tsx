import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { AttendanceHistoryList } from "@/components/parent/AttendanceHistoryList";

export const Route = createFileRoute("/_authenticated/parent/attendance")({
  component: ParentAttendancePage,
});

function ParentAttendancePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.attendance.title")} />
      <ParentPageFrame requirePermission="can_view_attendance">
        {(child) => <AttendanceHistoryList studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}
