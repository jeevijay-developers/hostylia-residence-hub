import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RevenueCollectionsSummary } from "@/components/finance/RevenueCollectionsSummary";
import { RefundApprovalList } from "@/components/finance/RefundApprovalList";
import { RefundHistoryPanel } from "@/components/finance/RefundHistoryPanel";
import { usePropertyStore } from "@/stores/property-store";

// URL path preserved for stability; UI copy is "Revenue & Collections Summary"
// per DB-Schema.md §50 — v1 has no expense data, do not call this P&L.
export const Route = createFileRoute("/_authenticated/admin/finance/pnl")({
  component: RevenueCollectionsPage,
});

function RevenueCollectionsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);

  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Choose a property first.
      </p>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Finance overview" />
      <RevenueCollectionsSummary propertyId={propertyId} />
      <RefundApprovalList propertyId={propertyId} />
      <RefundHistoryPanel propertyId={propertyId} canProcess />
    </div>
  );
}
