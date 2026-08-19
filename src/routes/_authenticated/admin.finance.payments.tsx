import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PaymentEntryForm } from "@/components/finance/PaymentEntryForm";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/finance/payments")({
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Choose a property first.
      </p>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Record payment" />
      <PaymentEntryForm propertyId={propertyId} />
    </div>
  );
}
