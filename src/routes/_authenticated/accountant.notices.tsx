import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenNoticesPage } from "./warden.notices";

// Admin-granted Notices for an Accountant — reuses the existing Warden
// notices page as-is; the guard + RLS enforce the `notices` key.
export const Route = createFileRoute("/_authenticated/accountant/notices")({
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="notices">
      <WardenNoticesPage />
    </StaffModuleGuard>
  ),
});
