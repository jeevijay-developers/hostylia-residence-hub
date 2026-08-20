import { createFileRoute } from "@tanstack/react-router";
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
      <PaymentEntryForm propertyId={propertyId} />
      <PaymentHistoryPanel propertyId={propertyId} />
    </div>
  );
}
