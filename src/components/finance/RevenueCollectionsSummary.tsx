import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, FileEdit, Info, Wallet, Coins, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRevenueCollectionsSummary } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";
import { cn } from "@/lib/utils";

/**
 * Revenue & Collections Summary (NOT called P&L per DB-Schema.md §50 —
 * v1 does not capture expense data, so this is collections-only).
 */
export function RevenueCollectionsSummary({ propertyId }: { propertyId: string }) {
  const fn = useServerFn(getRevenueCollectionsSummary);
  const q = useQuery({
    queryKey: ["revenue-collections", propertyId],
    queryFn: () => fn({ data: { property_id: propertyId } }),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!q.data) return null;
  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={FileEdit} label="Total Invoiced" value={formatInr(d.total_issued_paise)} tone="info" />
        <Kpi icon={Wallet} label="Collected" value={formatInr(d.total_collected_paise)} tone="success" />
        <Kpi icon={Coins} label="Outstanding" value={formatInr(d.total_outstanding_paise)} tone="warning" />
      </div>
      <Card className="rounded-2xl border-border/80 bg-card shadow-card-ambient">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold sm:text-lg">Aging (outstanding balance)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AgingRows aging={d.aging_paise} />
          <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-background/40 p-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Collection rate:{" "}
              <span className="font-semibold text-info">
                {(d.collection_rate * 100).toFixed(1)}%
              </span>
              . This is a revenue &amp; collections summary — not a full P&amp;L (does not capture
              expense data).
            </p>
          </div>
        </CardContent>
      </Card>
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
} as const;

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof KPI_TONE;
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
