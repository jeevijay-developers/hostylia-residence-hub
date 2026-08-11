import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PaymentEntryForm } from "@/components/finance/PaymentEntryForm";
import { PaymentHistoryPanel } from "@/components/finance/PaymentHistoryPanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/payments")({
  component: AccPaymentsPage,
});

function AccPaymentsPage() {
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
      <PageHeader
        title="Payments"
        description="Record cash, cheque, bank transfer or UPI payments."
      />
      <PaymentEntryForm propertyId={propertyId} />
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Payment history</h2>
        <PaymentHistoryPanel propertyId={propertyId} />
      </div>
    </div>
  );
}
