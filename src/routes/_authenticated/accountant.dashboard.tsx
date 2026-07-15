import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, AlertCircle, Wallet } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const Route = createFileRoute("/_authenticated/accountant/dashboard")({
  component: AccountantDashboardPage,
});

function AccountantDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Finance dashboard" description="Track collections, dues and overdue invoices." />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={Wallet} label="Collected" value="—" />
        <KpiCard icon={CircleDollarSign} label="Outstanding" value="—" />
        <KpiCard icon={AlertCircle} label="Overdue" value={0} />
      </div>
      <EmptyState
        title="No invoices yet"
        description="Once invoices are generated, they'll show up here for follow-up."
      />
    </div>
  );
}
