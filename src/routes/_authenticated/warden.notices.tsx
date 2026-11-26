import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenNoticesPage } from "@/components/warden/WardenNoticesPage";

export const Route = createFileRoute("/_authenticated/warden/notices")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="notices">
      <WardenNoticesPage />
    </StaffModuleGuard>
  ),
});
