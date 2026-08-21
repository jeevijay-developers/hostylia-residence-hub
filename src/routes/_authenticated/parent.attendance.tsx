import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { AttendanceRecordsList } from "@/components/parent/AttendanceRecordsList";
import { MonthlyAttendanceReportCard } from "@/components/parent/MonthlyAttendanceReportCard";
import { GateHistoryList } from "@/components/parent/GateHistoryList";
import { SectionHeading } from "@/components/parent/SectionHeading";
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
      <PageHeader title={t("parent.attendance.title")} />
      <ParentPageFrame>
        {(child) => (
          <div className="space-y-6">
            {child.can_view_attendance ? (
              <>
                <MonthlyAttendanceReportGate studentId={child.student_id} />
                <div className="space-y-3">
                  <SectionHeading>{t("parent.attendance.recordsTitle")}</SectionHeading>
                  <AttendanceRecordsList studentId={child.student_id} />
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                —
              </p>
            )}
            {child.can_view_gate_events && (
              <div className="space-y-3">
                <SectionHeading>{t("parent.gateHistory.title")}</SectionHeading>
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
  const { t } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState("");

  if (!selectedMonth) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-info/10 text-info">
            <Calendar className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <Label
              htmlFor="attendance-report-month"
              className="text-sm font-medium text-foreground"
            >
              {t("parent.attendance.monthlyReportPrompt")}
            </Label>
          </div>
        </div>
        <Input
          id="attendance-report-month"
          type="month"
          className="h-10 w-full max-w-44 rounded-xl"
          max={currentMonthValue()}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
      </div>
    );
  }

  return <MonthlyAttendanceReportCard studentId={studentId} initialMonth={selectedMonth} />;
}
