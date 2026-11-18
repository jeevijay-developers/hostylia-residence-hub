import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { PaymentEntryForm } from "@/components/finance/PaymentEntryForm";
import { PaymentHistoryPanel } from "@/components/finance/PaymentHistoryPanel";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/payments")({
  validateSearch: (search: Record<string, unknown>): { paidToday?: string } => ({
    paidToday: typeof search.paidToday === "string" ? search.paidToday : undefined,
  }),
  component: () => (
    <StaffModuleGuard role="WARDEN" module="payments_view">
      <WardenPaymentsPage />
    </StaffModuleGuard>
  ),
});

function WardenPaymentsPage() {
  const { paidToday } = Route.useSearch();
  const { propertyId, can, isLoading } = useWardenPermissions();
  if (isLoading) return null;
  if (!propertyId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
      <PaymentEntryForm propertyId={propertyId} canCreate={can("payments_create")} />
      <PaymentHistoryPanel propertyId={propertyId} onlyCapturedToday={paidToday === "1"} />
    </div>
  );
}
