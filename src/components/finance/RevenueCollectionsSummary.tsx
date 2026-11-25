import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Calendar,
  Coins,
  FileEdit,
  Percent,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter, type DateRangePreset } from "@/components/reports/DateRangeFilter";
import { ExportButton } from "@/components/reports/ExportButton";
import { CollectionOverviewChart } from "@/components/reports/charts";
import { getAgingBuckets, getCollectionReport } from "@/lib/reports.functions";
import { getCollectionSeries } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";
import {
  currentMonthRange,
  formatRange,
  lastMonthRange,
  thisWeekRange,
  thisYearRange,
  todayRange,
  type DateRange,
} from "@/lib/report-range";
import { cn } from "@/lib/utils";
import type { CsvColumn } from "@/lib/csv";

const FINANCE_PRESETS: DateRangePreset[] = [
  { label: "Today", range: todayRange() },
  { label: "This week", range: thisWeekRange() },
  { label: "This month", range: currentMonthRange() },
  { label: "Last month", range: lastMonthRange() },
  { label: "This year", range: thisYearRange() },
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_ABBR[m - 1] ?? ""}`;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1] ?? ""} ${y}`;
}

/** Inclusive calendar-day span of a "YYYY-MM-DD" range (matches fn_collection_series' own limit). */
function daySpan(range: DateRange): number {
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** 78.5 -> "78.5%", 100 -> "100%". */
function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

type ExportRow = Record<"metric" | "value", string>;
const exportColumns: CsvColumn<ExportRow>[] = [
  { key: "metric", label: "Metric" },
  { key: "value", label: "Value" },
];

/**
 * Revenue & Collections Summary (NOT called P&L per DB-Schema.md §50 — v1 does not capture expense
 * data, so this is collections-only). All figures come from fn_collection_report / fn_collection_series
 * (migrations 20261109090000 → 20261127090000), which net completed refunds out of what was received —
 * the same source of truth the Admin Reports > DSO & aging page uses, so the two pages never disagree.
 * Pending/Overdue KPI headline figures are scoped to the selected period's invoice cohort (by issue
 * date); the 0-30/31-60/60+ aging breakdown stays all-time, exactly like the Reports page, since "days
 * overdue" describes today's state, not the reporting period.
 */
export function RevenueCollectionsSummary({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const [range, setRange] = useState<DateRange>(() => currentMonthRange());

  const collectionFn = useServerFn(getCollectionReport);
  const bucketsFn = useServerFn(getAgingBuckets);
  const seriesFn = useServerFn(getCollectionSeries);

  const collectionQ = useQuery({
    queryKey: ["finance-overview-collection", propertyId, range.from, range.to],
    queryFn: () =>
      collectionFn({ data: { property_id: propertyId, from: range.from, to: range.to } }),
  });
  const bucketsQ = useQuery({
    queryKey: ["finance-overview-aging-buckets", propertyId],
    queryFn: () => bucketsFn({ data: { property_id: propertyId } }),
  });

  const span = daySpan(range);
  const dailyEnabled = span <= 366;
  const dailyQ = useQuery({
    queryKey: ["finance-overview-series-daily", propertyId, range.from, range.to],
    enabled: dailyEnabled,
    queryFn: () =>
      seriesFn({
        data: { property_id: propertyId, from: range.from, to: range.to, granularity: "day" },
      }),
  });
  const monthlyQ = useQuery({
    queryKey: ["finance-overview-series-monthly", propertyId, range.from, range.to],
    queryFn: () =>
      seriesFn({
        data: { property_id: propertyId, from: range.from, to: range.to, granularity: "month" },
      }),
  });

  const d = collectionQ.data;
  const dailyChartData = (dailyQ.data ?? []).map((r) => ({
    period: dayLabel(r.period),
    amount_paise: r.collected_paise,
  }));
  const monthlyChartData = (monthlyQ.data ?? []).map((r) => ({
    period: monthLabel(r.period),
    amount_paise: r.collected_paise,
  }));

  const exportRows: ExportRow[] = d
    ? [
        { metric: "Period", value: formatRange(range) },
        { metric: "Total Invoiced", value: formatInr(d.billed_paise) },
        { metric: "Payments Received", value: formatInr(d.received_paise) },
        { metric: "Refunded (completed)", value: formatInr(d.refunded_paise) },
        { metric: "Collected (net)", value: formatInr(d.collected_paise) },
        { metric: "Collection Rate", value: pct(d.collection_rate_pct) },
        { metric: "Outstanding Amount", value: formatInr(d.pending_paise) },
        { metric: "Pending Payments", value: formatInr(d.pending_paise) },
        { metric: "Overdue Amount", value: formatInr(d.overdue_balance_paise) },
        { metric: "Aging — Current", value: formatInr(bucketsQ.data?.aging_paise.current ?? 0) },
        { metric: "Aging — 0-30 days", value: formatInr(bucketsQ.data?.aging_paise["0-30"] ?? 0) },
        { metric: "Aging — 31-60 days", value: formatInr(bucketsQ.data?.aging_paise["31-60"] ?? 0) },
        { metric: "Aging — 60+ days", value: formatInr(bucketsQ.data?.aging_paise["60+"] ?? 0) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={range} onChange={setRange} presets={FINANCE_PRESETS} />
        {showExport && (
          <ExportButton
            filename="revenue-collections-summary"
            title="Revenue & Collections Summary"
            rows={exportRows}
            columns={exportColumns}
            disabled={collectionQ.isLoading || collectionQ.isError}
          />
        )}
      </div>

      {collectionQ.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
      {collectionQ.isError && (
        <p className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {collectionQ.error instanceof Error
            ? collectionQ.error.message
            : "Could not load the finance summary."}
        </p>
      )}

      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon={FileEdit} label="Total Invoiced" value={formatInr(d.billed_paise)} tone="info" />
            <Kpi
              icon={Wallet}
              label="Collected"
              value={formatInr(d.collected_paise)}
              tone="success"
              detail={
                <p>
                  {formatInr(d.received_paise)} received − {formatInr(d.refunded_paise)} refunded
                </p>
              }
            />
            <Kpi icon={Undo2} label="Refunded" value={formatInr(d.refunded_paise)} tone="warning" />
            <Kpi
              icon={Percent}
              label="Collection Rate"
              value={pct(d.collection_rate_pct)}
              tone="info"
            />
            <Kpi
              icon={Coins}
              label="Outstanding Amount"
              value={formatInr(d.pending_paise)}
              tone="warning"
              detail={<p>Total billed and not yet collected</p>}
            />
            <Kpi
              icon={Wallet}
              label="Pending Payments"
              value={formatInr(d.pending_paise)}
              tone="warning"
              detail={
                <p>
                  {d.due_unpaid_count} invoice{d.due_unpaid_count === 1 ? "" : "s"} with a pending
                  balance
                </p>
              }
            />
            <Kpi
              icon={AlertTriangle}
              label="Overdue Amount"
              value={formatInr(d.overdue_balance_paise)}
              tone="destructive"
              detail={
                d.due_unpaid_count === 0 ? (
                  <p>No unpaid invoices in this period</p>
                ) : (
                  <p>
                    {pct(d.overdue_pct)} of {d.due_unpaid_count} unpaid invoice
                    {d.due_unpaid_count === 1 ? "" : "s"}
                  </p>
                )
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-border/80 bg-card shadow-card-ambient">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold sm:text-lg">
                  Daily collections
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!dailyEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Pick a range of 366 days or less to see the daily breakdown.
                  </p>
                )}
                {dailyEnabled && dailyQ.isLoading && (
                  <Skeleton className="h-64 w-full rounded-xl" />
                )}
                {dailyEnabled && dailyQ.isError && (
                  <p className="text-sm text-destructive">
                    {dailyQ.error instanceof Error
                      ? dailyQ.error.message
                      : "Could not load the daily chart."}
                  </p>
                )}
                {dailyEnabled && !dailyQ.isLoading && !dailyQ.isError && (
                  <CollectionOverviewChart data={dailyChartData} />
                )}
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/80 bg-card shadow-card-ambient">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold sm:text-lg">
                  Monthly collections
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyQ.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
                {monthlyQ.isError && (
                  <p className="text-sm text-destructive">
                    {monthlyQ.error instanceof Error
                      ? monthlyQ.error.message
                      : "Could not load the monthly chart."}
                  </p>
                )}
                {!monthlyQ.isLoading && !monthlyQ.isError && (
                  <CollectionOverviewChart data={monthlyChartData} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/80 bg-card shadow-card-ambient">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold sm:text-lg">
                Aging (outstanding balance)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                All unpaid invoices of this property, whatever their issue date (not limited to the
                period above) — the same figures as Admin Reports &gt; DSO &amp; aging.
              </p>
              {bucketsQ.isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
              {bucketsQ.data && <AgingRows aging={bucketsQ.data.aging_paise} />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const KPI_TONE = {
  info: {
    border: "border-info/30",
    iconBg: "bg-info/15 text-info border-info/30",
    text: "text-foreground",
  },
  success: {
    border: "border-success/30",
    iconBg: "bg-success/15 text-success border-success/30",
    text: "text-success",
  },
  warning: {
    border: "border-warning/30",
    iconBg: "bg-warning/15 text-warning border-warning/30",
    text: "text-warning",
  },
  destructive: {
    border: "border-destructive/30",
    iconBg: "bg-destructive/15 text-destructive border-destructive/30",
    text: "text-destructive",
  },
} as const;

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof KPI_TONE;
  detail?: React.ReactNode;
}) {
  const t = KPI_TONE[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-4 shadow-card-ambient panel-lift sm:p-5",
        t.border,
      )}
    >
      <Icon className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 opacity-[0.06]" aria-hidden="true" />
      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-tone-glow",
            t.iconBg,
          )}
          style={{ ["--glow-tone" as string]: `var(--${tone})` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          <p className={cn("mt-0.5 text-xl font-bold sm:text-2xl", t.text)}>{value}</p>
          {detail && <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">{detail}</div>}
        </div>
      </div>
    </div>
  );
}

const AGING_TONE: Record<string, string> = {
  current: "bg-neutral-accent/15 text-neutral-accent border-neutral-accent/30",
  "0-30": "bg-info/15 text-info border-info/30",
  "31-60": "bg-warning/15 text-warning border-warning/30",
  "60+": "bg-destructive/15 text-destructive border-destructive/30",
};

function AgingRows({ aging }: { aging: Record<string, number> }) {
  const buckets: Array<[string, string]> = [
    ["current", "Current"],
    ["0-30", "0–30 days"],
    ["31-60", "31–60 days"],
    ["60+", "60+ days"],
  ];
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80">
      {buckets.map(([k, label]) => (
        <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                AGING_TONE[k],
              )}
            >
              <Calendar className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-medium text-foreground">{label}</span>
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
            {formatInr(aging[k] ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}
