import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenMessPage } from "@/components/warden/WardenMessPage";

export const Route = createFileRoute("/_authenticated/warden/mess")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="mess_menus">
      <WardenMessPage />
    </StaffModuleGuard>
  ),
});
