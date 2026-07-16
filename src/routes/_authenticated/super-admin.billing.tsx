import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendingUp, CreditCard, Users } from "lucide-react";
import { getPlatformMetrics, listSubscriptionsWithPlan } from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/billing")({
  component: SuperBillingPage,
});

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function SuperBillingPage() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const subsFn = useServerFn(listSubscriptionsWithPlan);
  const { data: metrics } = useQuery({ queryKey: ["platform-metrics"], queryFn: () => metricsFn({}) });
  const { data: subs = [] } = useQuery({ queryKey: ["all-subscriptions"], queryFn: () => subsFn({}) });

  const chartData = Object.entries(metrics?.tenants_by_status ?? {}).map(([k, v]) => ({ status: k, count: v }));

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & Revenue" description="MRR, churn, and active subscriptions across all tenants." />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={TrendingUp} label="MRR" value={metrics ? formatInr(metrics.mrr_paise) : "—"} />
        <KpiCard icon={CreditCard} label="Active subscriptions" value={metrics?.active_subscriptions ?? 0} />
        <KpiCard icon={Users} label="30-day churn" value={metrics ? `${(metrics.churn_30d * 100).toFixed(1)}%` : "—"} />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Tenants by status</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Tenant</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Period ends</th>
              <th className="px-4 py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s: any) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{s.tenant_id.slice(0, 8)}</td>
                <td className="px-4 py-2">{s.plans?.name ?? "—"}</td>
                <td className="px-4 py-2">{s.status}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2 text-right">{s.plans ? `${formatInr(s.plans.price_paise)} / ${s.plans.billing_interval?.toLowerCase()}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
