import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FeePlansPanel } from "@/components/finance/FeePlansPanel";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/finance/fee-plans")({
  component: FeePlansPage,
});

function FeePlansPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId)
    return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Fee plans" />
      <FeePlansPanel propertyId={propertyId} />
    </div>
  );
}
