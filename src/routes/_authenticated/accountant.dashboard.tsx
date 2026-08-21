import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CircleDollarSign,
  AlertCircle,
  Wallet,
  Clock,
  Gauge,
  ChevronRight,
  ReceiptText,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionOverviewChart } from "@/components/reports/charts";
import { getAgingReport } from "@/lib/reports.functions";
import { formatInr, INVOICE_STATUS_TONE, PAYMENT_STATUS_TONE } from "@/lib/finance";
import { useAccountantProperty } from "@/lib/staff-scope";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accountant/dashboard")({
  component: AccountantDashboardPage,
});

interface AgingInvoiceRow {
  id: string;
  invoice_number: string;
  students: { full_name: string } | null;
  due_date: string;
  days_overdue: number;
  aging_bucket: string;
  balance_paise: number;
  status: string;
}

/** Same "Today/This Week/This Month" captured-payments totals feed both the
 * "Today's Collection" KPI and the Collection Overview chart — one query. */
function useAccountantCollectionsOverview(propertyId: string | null) {
  return useQuery({
    queryKey: ["accountant-collections-overview", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dow = startOfToday.getDay();
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      // Fetch from whichever cutoff is earlier — near a month boundary the
      // rolling calendar week can start before the 1st of this month.
      const queryFrom = startOfWeek < startOfMonth ? startOfWeek : startOfMonth;

      const { data, error } = await supabase
        .from("payments")
        .select("amount_paise, paid_at")
        .eq("property_id", propertyId!)
        .eq("status", "CAPTURED")
        .gte("paid_at", queryFrom.toISOString());
      if (error) throw new Error(error.message);

      let today = 0;
      let week = 0;
      let month = 0;
      for (const p of data ?? []) {
        if (!p.paid_at) continue;
        const t = new Date(p.paid_at).getTime();
        if (t >= startOfMonth.getTime()) month += p.amount_paise;
        if (t >= startOfWeek.getTime()) week += p.amount_paise;
        if (t >= startOfToday.getTime()) today += p.amount_paise;
      }
      return { today, week, month };
    },
  });
}

function useAccountantRecentPayments(propertyId: string | null) {
  return useQuery({
    queryKey: ["accountant-recent-payments", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, mode, amount_paise, status, paid_at, created_at, students(full_name), invoices(invoice_number)",
        )
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useAccountantRecentInvoices(propertyId: string | null) {
  return useQuery({
    queryKey: ["accountant-recent-invoices", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_paise, due_date, status, students(full_name)")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Re-buckets the same per-invoice aging rows the KPI cards use into the
 * 0–7 / 8–30 / 31–60 / 60+ day ranges — no new query, no DB view change
 * (v_invoice_aging's own current/0-30/31-60/60+ split feeds the Reports
 * page and RevenueCollectionsSummary elsewhere; this is a dashboard-only
 * re-grouping of the same `days_overdue` figures). */
function rebucketAging(rows: AgingInvoiceRow[]) {
  const buckets: Record<"0-7" | "8-30" | "31-60" | "60+", number> = {
    "0-7": 0,
    "8-30": 0,
    "31-60": 0,
    "60+": 0,
  };
  for (const r of rows) {
    if (r.aging_bucket === "paid" || r.balance_paise <= 0) continue;
    const d = r.days_overdue;
    if (d <= 7) buckets["0-7"] += r.balance_paise;
    else if (d <= 30) buckets["8-30"] += r.balance_paise;
    else if (d <= 60) buckets["31-60"] += r.balance_paise;
    else buckets["60+"] += r.balance_paise;
  }
  return buckets;
}

function AccountantDashboardPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  const fn = useServerFn(getAgingReport);
  const agingQ = useQuery({
    queryKey: ["report-aging", propertyId],
    enabled: !!propertyId,
    queryFn: () => fn({ data: { property_id: propertyId! } }),
  });
  const collectionsQ = useAccountantCollectionsOverview(propertyId);
  const recentPaymentsQ = useAccountantRecentPayments(propertyId);
  const recentInvoicesQ = useAccountantRecentInvoices(propertyId);

  const rows = (agingQ.data?.rows ?? []) as AgingInvoiceRow[];
  // "Pending" = not yet due (v_invoice_aging's own "current" bucket);
  // "Overdue" = same split the previous version of this page already used.
  const pendingCount = rows.filter(
    (r) => r.aging_bucket === "current" && r.balance_paise > 0,
  ).length;
  const overdueCount = rows.filter(
    (r) => r.aging_bucket !== "paid" && r.aging_bucket !== "current" && r.balance_paise > 0,
  ).length;
  const hasInvoices = rows.length > 0;
  const collectionRatePct =
    agingQ.data && agingQ.data.total_issued_paise > 0
      ? (agingQ.data.total_collected_paise / agingQ.data.total_issued_paise) * 100
      : 0;
  const agingBuckets = rebucketAging(rows);

  const loading = propertyLoading || (!!propertyId && agingQ.isLoading);
  const collectionsLoading = propertyLoading || (!!propertyId && collectionsQ.isLoading);

  const chartData = collectionsQ.data
    ? [
        { period: "Today", amount_paise: collectionsQ.data.today },
        { period: "This Week", amount_paise: collectionsQ.data.week },
        { period: "This Month", amount_paise: collectionsQ.data.month },
      ]
    : [];

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <FinanceKpiCard
          icon={CircleDollarSign}
          label="Total Outstanding"
          value={agingQ.data ? formatInr(agingQ.data.total_outstanding_paise) : "—"}
          loading={loading}
          tone="info"
        />
        <FinanceKpiCard
          icon={Wallet}
          label="Today's Collection"
          value={collectionsQ.data ? formatInr(collectionsQ.data.today) : "—"}
          loading={collectionsLoading}
          tone="success"
        />
        <FinanceKpiCard
          icon={Clock}
          label="Pending Payments"
          value={pendingCount}
          loading={loading}
          tone={pendingCount > 0 ? "warning" : "muted"}
        />
        <FinanceKpiCard
          icon={AlertCircle}
          label="Overdue Invoices"
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

      {propertyId && !agingQ.isLoading && !hasInvoices && (
        <EmptyState
          title="No invoices yet"
          description="Once invoices are generated, they'll show up here for follow-up."
        />
      )}

      {propertyId && hasInvoices && (
        <>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {collectionsLoading ? (
                  <Skeleton className="h-64 w-full rounded-xl" />
                ) : (
                  <CollectionOverviewChart data={chartData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">DSO &amp; Collection Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent">
                    <Gauge className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Days Sales Outstanding</p>
                    <p className="font-display text-xl font-bold text-foreground">
                      {loading ? "—" : `${agingQ.data?.dso_days ?? 0}d`}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Collection rate</span>
                    <span className="font-semibold text-success">
                      {loading ? "—" : `${collectionRatePct.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${Math.min(100, Math.max(0, collectionRatePct))}%` }}
                    />
                  </div>
                </div>
                <Link
                  to="/accountant/reports"
                  className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
                >
                  View full report <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aging Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <AgingBucketRows buckets={agingBuckets} />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <RecentPaymentsCard query={recentPaymentsQ} />
            <RecentInvoicesCard query={recentInvoicesQ} />
          </div>
        </>
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
  warning: {
    border: "border-warning/20",
    iconBg: "bg-warning/15 text-warning",
    glow: "var(--warning)",
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

const AGING_BUCKET_LABELS: Array<[keyof ReturnType<typeof rebucketAging>, string]> = [
  ["0-7", "0–7 days"],
  ["8-30", "8–30 days"],
  ["31-60", "31–60 days"],
  ["60+", "60+ days"],
];

const AGING_BUCKET_TONE: Record<string, string> = {
  "0-7": "bg-info/15 text-info border-info/30",
  "8-30": "bg-warning/15 text-warning border-warning/30",
  "31-60": "bg-destructive/15 text-destructive border-destructive/30",
  "60+": "bg-destructive/15 text-destructive border-destructive/30",
};

function AgingBucketRows({ buckets }: { buckets: ReturnType<typeof rebucketAging> }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80">
      {AGING_BUCKET_LABELS.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold",
                AGING_BUCKET_TONE[key],
              )}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-medium text-foreground">{label}</span>
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
            {formatInr(buckets[key])}
          </span>
        </div>
      ))}
    </div>
  );
}

type RecentPaymentRow = NonNullable<ReturnType<typeof useAccountantRecentPayments>["data"]>[number];
type RecentInvoiceRow = NonNullable<ReturnType<typeof useAccountantRecentInvoices>["data"]>[number];

function RecentPaymentsCard({
  query,
}: {
  query: ReturnType<typeof useAccountantRecentPayments>;
}) {
  const rows = (query.data ?? []) as RecentPaymentRow[];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No payments recorded yet"
            description="Recorded payments will appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {p.students?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {p.invoices?.invoice_number ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                      {formatInr(p.amount_paise)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.mode}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          PAYMENT_STATUS_TONE[p.status as keyof typeof PAYMENT_STATUS_TONE] ??
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link
          to="/accountant/payments"
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
        >
          <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
          View all payments <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

function RecentInvoicesCard({
  query,
}: {
  query: ReturnType<typeof useAccountantRecentInvoices>;
}) {
  const rows = (query.data ?? []) as RecentInvoiceRow[];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices will appear here once generated." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Student</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Due Date</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.invoice_number}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {r.students?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                      {formatInr(r.total_paise)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.due_date}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          INVOICE_STATUS_TONE[r.status as keyof typeof INVOICE_STATUS_TONE] ??
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link
          to="/accountant/invoices"
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          View all invoices <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
