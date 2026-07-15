import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RevenueCollectionsSummary } from "@/components/finance/RevenueCollectionsSummary";
import { RefundApprovalList } from "@/components/finance/RefundApprovalList";
import { usePropertyStore } from "@/stores/property-store";

// URL path preserved for stability; UI copy is "Revenue & Collections Summary"
// per DB-Schema.md §50 — v1 has no expense data, do not call this P&L.
export const Route = createFileRoute("/_authenticated/admin/finance/pnl")({
  component: RevenueCollectionsPage,
});

function RevenueCollectionsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue & Collections Summary"
        description="Collections, dues and aging. Not a full profit-and-loss report."
      />
      <RevenueCollectionsSummary propertyId={propertyId} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Refund approvals</h2>
        <RefundApprovalList propertyId={propertyId} />
      </section>
    </div>
  );
}
