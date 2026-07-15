import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PaymentEntryForm } from "@/components/finance/PaymentEntryForm";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/accountant/payments")({
  component: AccPaymentsPage,
});

function AccPaymentsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Record payment" description="Cash, cheque, bank transfer or UPI." />
      <PaymentEntryForm propertyId={propertyId} />
    </div>
  );
}
