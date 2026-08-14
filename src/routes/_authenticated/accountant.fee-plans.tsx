import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FeePlansPanel } from "@/components/finance/FeePlansPanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/fee-plans")({
  component: AccFeePlansPage,
});

function AccFeePlansPage() {
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
        title="Fee plans"
        description="Rent, mess, deposit and other charges by property."
      />
      <FeePlansPanel propertyId={propertyId} />
    </div>
  );
}
