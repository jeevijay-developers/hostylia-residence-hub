import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { gateSearchSchema } from "@/schemas/staff-search";
import { WardenGatePage } from "@/components/warden/WardenGatePage";

export const Route = createFileRoute("/_authenticated/warden/gate")({
  validateSearch: gateSearchSchema,
  component: () => (
    <StaffModuleGuard role="WARDEN" module="gate_any">
      <WardenGatePage />
    </StaffModuleGuard>
  ),
});
