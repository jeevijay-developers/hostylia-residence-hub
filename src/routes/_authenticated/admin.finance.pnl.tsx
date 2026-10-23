import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ExportButton } from "@/components/reports/ExportButton";
import { RevenueCollectionsSummary } from "@/components/finance/RevenueCollectionsSummary";
import { RefundApprovalList } from "@/components/finance/RefundApprovalList";
import { getRevenueCollectionsSummary } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";
import { usePropertyStore } from "@/stores/property-store";
import type { CsvColumn } from "@/lib/csv";

// URL path preserved for stability; UI copy is "Revenue & Collections Summary"
// per DB-Schema.md §50 — v1 has no expense data, do not call this P&L.
export const Route = createFileRoute("/_authenticated/admin/finance/pnl")({
  component: RevenueCollectionsPage,
});

type ExportRow = Record<"metric" | "value", string>;

function RevenueCollectionsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);

  // Same server fn + query key RevenueCollectionsSummary itself uses below —
  // React Query dedupes identical key+fn pairs, so this reads the one
  // already-fetched/cached result instead of issuing a second request. Kept
  // here (rather than lifting state into that shared component) so the
  // export button is the only thing changed on this page.
  const fn = useServerFn(getRevenueCollectionsSummary);
  const summaryQ = useQuery({
    queryKey: ["revenue-collections", propertyId],
    queryFn: () => fn({ data: { property_id: propertyId! } }),
    enabled: !!propertyId,
  });

  useEffect(() => {
    if (summaryQ.isError) {
      toast.error("Could not load the finance report to export");
    }
  }, [summaryQ.isError]);

  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Choose a property first.
      </p>
    );

  const d = summaryQ.data;
  const exportRows: ExportRow[] = d
    ? [
        { metric: "Total Invoiced", value: formatInr(d.total_issued_paise) },
        { metric: "Collected", value: formatInr(d.total_collected_paise) },
        { metric: "Outstanding", value: formatInr(d.total_outstanding_paise) },
        { metric: "Aging — Current", value: formatInr(d.aging_paise.current ?? 0) },
        { metric: "Aging — 0-30 days", value: formatInr(d.aging_paise["0-30"] ?? 0) },
        { metric: "Aging — 31-60 days", value: formatInr(d.aging_paise["31-60"] ?? 0) },
        { metric: "Aging — 60+ days", value: formatInr(d.aging_paise["60+"] ?? 0) },
        { metric: "Collection Rate", value: `${(d.collection_rate * 100).toFixed(1)}%` },
      ]
    : [];
  const exportColumns: CsvColumn<ExportRow>[] = [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance overview"
        actions={
          <ExportButton
            filename="revenue-collections-summary"
            title="Revenue & Collections Summary"
            rows={exportRows}
            columns={exportColumns}
            disabled={summaryQ.isLoading || summaryQ.isError}
          />
        }
      />
      <RevenueCollectionsSummary propertyId={propertyId} />
      <RefundApprovalList propertyId={propertyId} />
    </div>
  );
}
