import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenGatePage, gateSearchSchema } from "./warden.gate";

// Admin-granted Gate Pass / Visitors for an Accountant — reuses the existing
// Warden gate page as-is; the guard + RLS (can_*_gate_passes/visitors) enforce the keys.
export const Route = createFileRoute("/_authenticated/accountant/gate")({
  validateSearch: gateSearchSchema,
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="gate_any">
      <WardenGatePage />
    </StaffModuleGuard>
  ),
});
