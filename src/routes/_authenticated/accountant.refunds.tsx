import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RefundRequestForm } from "@/components/finance/RefundRequestForm";
import { RefundHistoryPanel } from "@/components/finance/RefundHistoryPanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/refunds")({
  component: AccRefundsPage,
});

function AccRefundsPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="space-y-6">
      <PageHeader title="Refunds" description="Initiate a refund — a Hostel Admin will approve." />
      <RefundRequestForm propertyId={propertyId} />
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Refund history</h2>
        <RefundHistoryPanel propertyId={propertyId} />
      </div>
    </div>
  );
}
