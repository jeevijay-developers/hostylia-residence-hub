import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Download, FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  if (!propertyId)
    return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Revenue & Collections Summary"
        actions={
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
          </span>
        }
      />
      <RevenueCollectionsSummary propertyId={propertyId} />
      <Card className="rounded-2xl border-border/80 bg-card shadow-xl">
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <FileCheck2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:text-base">
            Refund approvals
          </h2>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 [&>p]:mt-0 [&>p]:text-sm [&>p]:text-muted-foreground">
          <RefundApprovalList propertyId={propertyId} />
        </div>
      </Card>
    </div>
  );
}
