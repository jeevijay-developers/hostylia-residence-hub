import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { RefundRequestForm } from "@/components/finance/RefundRequestForm";
import { RefundHistoryPanel } from "@/components/finance/RefundHistoryPanel";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/refunds")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="refunds">
      <WardenRefundsPage />
    </StaffModuleGuard>
  ),
});

function WardenRefundsPage() {
  const { propertyId, isLoading } = useWardenPermissions();
  if (isLoading) return null;
  if (!propertyId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
      <RefundRequestForm propertyId={propertyId} />
      <RefundHistoryPanel propertyId={propertyId} />
    </div>
  );
}
