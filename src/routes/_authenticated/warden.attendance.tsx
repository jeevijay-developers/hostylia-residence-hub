import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { attendanceSearchSchema } from "@/schemas/staff-search";
import { WardenAttendancePage } from "@/components/warden/WardenAttendancePage";

export const Route = createFileRoute("/_authenticated/warden/attendance")({
  validateSearch: attendanceSearchSchema,
  component: () => (
    <StaffModuleGuard role="WARDEN" module="attendance_view">
      <WardenAttendancePage />
    </StaffModuleGuard>
  ),
});
