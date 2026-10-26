import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { WardenMessPage } from "./warden.mess";

// Admin-granted Mess Menu for an Accountant — reuses the existing Warden
// mess page as-is; the guard + RLS enforce the `mess_menus` key.
export const Route = createFileRoute("/_authenticated/accountant/mess")({
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="mess_menus">
      <WardenMessPage />
    </StaffModuleGuard>
  ),
});
