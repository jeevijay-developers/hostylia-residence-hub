import { createFileRoute } from "@tanstack/react-router";
import { DepositLedgerPanel } from "@/components/finance/DepositLedgerPanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/deposit-ledger")({
  component: AccDepositLedgerPage,
});

function AccDepositLedgerPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="space-y-4">
      <DepositLedgerPanel propertyId={propertyId} />
    </div>
  );
}
