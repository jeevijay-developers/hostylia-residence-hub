import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { FeePlansPanel } from "@/components/finance/FeePlansPanel";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/fee-plans")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="fee_plans_view">
      <WardenFeePlansPage />
    </StaffModuleGuard>
  ),
});

function WardenFeePlansPage() {
  const { propertyId, can, isLoading } = useWardenPermissions();
  if (isLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );

  return (
    <div className="space-y-6">
      <FeePlansPanel
        propertyId={propertyId}
        canCreate={can("fee_plans_create")}
        canEdit={can("fee_plans_edit")}
      />
    </div>
  );
}
