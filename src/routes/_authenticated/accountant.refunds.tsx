import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RefundRequestForm } from "@/components/finance/RefundRequestForm";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/accountant/refunds")({
  component: AccRefundsPage,
});

function AccRefundsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Refunds" description="Initiate a refund — a Hostel Admin will approve." />
      <RefundRequestForm propertyId={propertyId} />
    </div>
  );
}
