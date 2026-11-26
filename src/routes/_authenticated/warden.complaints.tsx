import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { complaintsSearchSchema } from "@/schemas/staff-search";
import { WardenComplaintsPage } from "@/components/warden/WardenComplaintsPage";

export const Route = createFileRoute("/_authenticated/warden/complaints")({
  validateSearch: complaintsSearchSchema,
  component: () => (
    <StaffModuleGuard role="WARDEN" module="complaints">
      <WardenComplaintsPage />
    </StaffModuleGuard>
  ),
});
