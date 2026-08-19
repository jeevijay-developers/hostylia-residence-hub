import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleDollarSign, AlertCircle, Wallet, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgingReport } from "@/lib/reports.functions";
import { formatInr } from "@/lib/finance";
import { useAccountantProperty } from "@/lib/staff-scope";
import { cn } from "@/lib/utils";

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

  const loading = propertyLoading || (!!propertyId && q.isLoading);

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <FinanceKpiCard
          icon={Wallet}
          label="Collected"
          value={q.data ? formatInr(q.data.total_collected_paise) : "—"}
          loading={loading}
          tone="success"
        />
        <FinanceKpiCard
          icon={CircleDollarSign}
          label="Outstanding"
          value={q.data ? formatInr(q.data.total_outstanding_paise) : "—"}
          loading={loading}
          tone="info"
        />
        <FinanceKpiCard
          icon={AlertCircle}
          label="Overdue"
          value={overdueCount}
          loading={loading}
          tone={overdueCount > 0 ? "destructive" : "muted"}
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

const FINANCE_TONE = {
  success: {
    border: "border-success/20",
    iconBg: "bg-success/15 text-success",
    glow: "var(--success)",
  },
  info: {
    border: "border-info/20",
    iconBg: "bg-info/15 text-info",
    glow: "var(--info)",
  },
  destructive: {
    border: "border-destructive/20",
    iconBg: "bg-destructive/15 text-destructive",
    glow: "var(--destructive)",
  },
  muted: {
    border: "border-border/80",
    iconBg: "bg-muted text-muted-foreground",
    glow: "var(--muted-foreground)",
  },
} as const;

/**
 * Bespoke to this dashboard (not the shared KpiCard, which several other role
 * dashboards reuse) — larger tone-tinted icon badge and card padding to match
 * the finance-dashboard reference design without touching shared components.
 */
function FinanceKpiCard({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  loading?: boolean;
  tone: keyof typeof FINANCE_TONE;
}) {
  const t = FINANCE_TONE[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card-ambient panel-lift sm:gap-4 sm:p-5",
        t.border,
      )}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-tone-glow sm:h-12 sm:w-12",
          t.iconBg,
        )}
        style={{ ["--glow-tone" as string]: t.glow }}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-8 w-20" />
        ) : (
          <p className="mt-0.5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
