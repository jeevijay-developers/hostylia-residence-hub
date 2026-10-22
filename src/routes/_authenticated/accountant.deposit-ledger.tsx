import { createFileRoute } from "@tanstack/react-router";
import { DepositLedgerPanel } from "@/components/finance/DepositLedgerPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
    <div className="space-y-6">
      <PageHeader title="Deposit Ledger" description="Security deposit tracking and settlement" />
      <DepositLedgerPanel propertyId={propertyId} />
    </div>
  );
}
