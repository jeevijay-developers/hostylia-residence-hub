import { createFileRoute } from "@tanstack/react-router";
import { Boxes, TrendingUp, CreditCard } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const Route = createFileRoute("/_authenticated/super-admin/dashboard")({
  component: SuperAdminDashboardPage,
});

function SuperAdminDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Platform overview" description="Tenants, revenue and subscription health across Hostylia." />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={Boxes} label="Total tenants" value={0} />
        <KpiCard icon={TrendingUp} label="MRR" value="—" />
        <KpiCard icon={CreditCard} label="Active subscriptions" value={0} />
      </div>
      <EmptyState
        title="No tenants onboarded yet"
        description="Once hostels sign up, you'll see their subscription and usage here."
      />
    </div>
  );
}
