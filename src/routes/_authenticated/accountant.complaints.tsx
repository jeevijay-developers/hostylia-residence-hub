import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenComplaintsPage, complaintsSearchSchema } from "./warden.complaints";

// Admin-granted Complaints for an Accountant — reuses the existing Warden
// complaints page as-is; the guard + RLS enforce the `complaints` key.
export const Route = createFileRoute("/_authenticated/accountant/complaints")({
  validateSearch: complaintsSearchSchema,
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="complaints">
      <WardenComplaintsPage />
    </StaffModuleGuard>
  ),
});
