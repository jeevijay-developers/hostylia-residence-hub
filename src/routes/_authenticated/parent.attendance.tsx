import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { AttendanceHistoryList } from "@/components/parent/AttendanceHistoryList";
import { MonthlyAttendanceReport } from "@/components/parent/MonthlyAttendanceReport";
import { GateHistoryList } from "@/components/parent/GateHistoryList";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const Route = createFileRoute("/_authenticated/parent/attendance")({
  component: ParentAttendancePage,
});

function ParentAttendancePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <ParentPageFrame>
        {(child) => (
          <div className="space-y-6">
            {child.can_view_attendance ? (
              <>
                <MonthlyAttendanceReportGate studentId={child.student_id} />
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

// Gates the Monthly Attendance Report behind an explicit Month/Year pick —
// unlike MonthlyAttendanceReport's own picker (which defaults to the current
// month), nothing renders here until the parent selects one.
function MonthlyAttendanceReportGate({ studentId }: { studentId: string }) {
  const [selectedMonth, setSelectedMonth] = useState("");

  if (!selectedMonth) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-4">
        <Label htmlFor="attendance-report-month" className="text-sm text-muted-foreground">
          Select month to view the attendance report
        </Label>
        <Input
          id="attendance-report-month"
          type="month"
          className="h-9 w-40"
          max={currentMonthValue()}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
      </div>
    );
  }

  return <MonthlyAttendanceReport studentId={studentId} initialMonth={selectedMonth} />;
}
