import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { AttendanceHistoryList } from "@/components/parent/AttendanceHistoryList";
import { MonthlyAttendanceReport } from "@/components/parent/MonthlyAttendanceReport";
import { GateHistoryList } from "@/components/parent/GateHistoryList";

export const Route = createFileRoute("/_authenticated/parent/attendance")({
  component: ParentAttendancePage,
});

function ParentAttendancePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.attendance.title")} />
      <ParentPageFrame>
        {(child) => (
          <div className="space-y-6">
            {child.can_view_attendance ? (
              <>
                <MonthlyAttendanceReport studentId={child.student_id} />
                <AttendanceHistoryList studentId={child.student_id} />
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                —
              </p>
            )}
            {child.can_view_gate_events && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("parent.gateHistory.title")}</div>
                <GateHistoryList studentId={child.student_id} />
              </div>
            )}
          </div>
        )}
      </ParentPageFrame>
    </div>
  );
}
