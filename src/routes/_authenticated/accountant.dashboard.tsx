import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleDollarSign, AlertCircle, Wallet } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { getAgingReport } from "@/lib/reports.functions";
import { formatInr } from "@/lib/finance";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/dashboard")({
  component: AccountantDashboardPage,
});

function AccountantDashboardPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  const fn = useServerFn(getAgingReport);
  const q = useQuery({
    queryKey: ["report-aging", propertyId],
    enabled: !!propertyId,
    queryFn: () => fn({ data: { property_id: propertyId! } }),
  });

  const overdueCount = (q.data?.rows ?? []).filter(
    (r) => r.aging_bucket !== "paid" && r.aging_bucket !== "current" && r.balance_paise > 0,
  ).length;
  const hasInvoices = (q.data?.rows.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Finance dashboard"
        description="Track collections, dues and overdue invoices."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Wallet}
          label="Collected"
          value={q.data ? formatInr(q.data.total_collected_paise) : "—"}
          loading={propertyLoading || (!!propertyId && q.isLoading)}
        />
        <KpiCard
          icon={CircleDollarSign}
          label="Outstanding"
          value={q.data ? formatInr(q.data.total_outstanding_paise) : "—"}
          loading={propertyLoading || (!!propertyId && q.isLoading)}
        />
        <KpiCard
          icon={AlertCircle}
          label="Overdue"
          value={overdueCount}
          loading={propertyLoading || (!!propertyId && q.isLoading)}
          tone={overdueCount > 0 ? "destructive" : "primary"}
        />
      </div>
      {!propertyLoading && !propertyId && (
        <EmptyState
          title="No property assigned yet"
          description="Contact your Hostel Admin to get access to a property's finance data."
        />
      )}
      {propertyId && !q.isLoading && !hasInvoices && (
        <EmptyState
          title="No invoices yet"
          description="Once invoices are generated, they'll show up here for follow-up."
        />
      )}
    </div>
  );
}
