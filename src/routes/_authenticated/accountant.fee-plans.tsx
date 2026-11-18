import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { FeePlansPanel } from "@/components/finance/FeePlansPanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/fee-plans")({
  component: () => (
    <StaffModuleGuard role="ACCOUNTANT" module="fee_plans_view">
      <AccFeePlansPage />
    </StaffModuleGuard>
  ),
});

function AccFeePlansPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );

  return (
    <div className="space-y-6">
      <FeePlansPanel propertyId={propertyId} />
    </div>
  );
}
