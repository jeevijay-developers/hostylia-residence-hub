import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Boxes, TrendingUp, CreditCard } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { getPlatformMetrics } from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/dashboard")({
  component: SuperAdminDashboardPage,
});

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function SuperAdminDashboardPage() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const { data: metrics } = useQuery({
    queryKey: ["platform-metrics"],
    queryFn: () => metricsFn({}),
  });

  const totalTenants = metrics
    ? Object.values(metrics.tenants_by_status).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Platform overview" description="Tenants, revenue and subscription health across Hostylia." />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={Boxes} label="Total tenants" value={totalTenants} />
        <KpiCard icon={TrendingUp} label="MRR" value={metrics ? formatInr(metrics.mrr_paise) : "—"} />
        <KpiCard icon={CreditCard} label="Active subscriptions" value={metrics?.active_subscriptions ?? 0} />
      </div>
      {!totalTenants && (
        <EmptyState
          title="No tenants onboarded yet"
          description="Once hostels sign up, you'll see their subscription and usage here."
        />
      )}
    </div>
  );
}
