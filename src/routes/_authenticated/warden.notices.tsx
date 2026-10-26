import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";

import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { useStaffPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/notices")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="notices">
      <WardenNoticesPage />
    </StaffModuleGuard>
  ),
});

export function WardenNoticesPage() {
  const { propertyId, isLoading } = useStaffPermissions();

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      {propertyId ? (
        <NoticeComposer propertyId={propertyId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No property assignment found for your warden role.
        </p>
      )}
    </div>
  );
}
