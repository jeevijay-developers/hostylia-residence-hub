import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenAttendancePage, attendanceSearchSchema } from "./warden.attendance";

// Admin-granted Attendance for an Accountant — reuses the existing Warden
// attendance page as-is; the guard + RLS (can_*_attendance) enforce the keys.
export const Route = createFileRoute("/_authenticated/accountant/attendance")({
  validateSearch: attendanceSearchSchema,
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="attendance_view">
      <WardenAttendancePage />
    </StaffModuleGuard>
  ),
});
