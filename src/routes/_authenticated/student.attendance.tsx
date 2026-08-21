import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { AttendanceHistoryList } from "@/components/parent/AttendanceHistoryList";
import { MonthlyAttendanceReport } from "@/components/parent/MonthlyAttendanceReport";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import { useStudentSelf } from "@/lib/complaint";

export const Route = createFileRoute("/_authenticated/student/attendance")({
  component: StudentAttendancePage,
});

function StudentAttendancePage() {
  const student = useStudentSelf();
  return (
    <StudentModuleGuard module="attendance">
      <div className="space-y-6">
        <PageHeader title="Attendance" description="Your last 30 recorded days." />
        {student.data?.id ? (
          <>
            <MonthlyAttendanceReport studentId={student.data.id} />
            <AttendanceHistoryList
              studentId={student.data.id}
              emptyTitle="No attendance recorded yet"
              emptyDescription="Your warden hasn't marked your attendance yet — it'll show up here once they do."
            />
          </>
        ) : (
          <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </StudentModuleGuard>
  );
}
