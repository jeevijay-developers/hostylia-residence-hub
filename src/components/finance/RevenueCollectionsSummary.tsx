import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRevenueCollectionsSummary } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";

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
        <Kpi label="Total invoiced" value={formatInr(d.total_issued_paise)} />
        <Kpi label="Collected" value={formatInr(d.total_collected_paise)} tone="success" />
        <Kpi label="Outstanding" value={formatInr(d.total_outstanding_paise)} tone="warning" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging (outstanding balance)</CardTitle>
        </CardHeader>
        <CardContent>
          <AgingBars aging={d.aging_paise} />
          <p className="mt-3 text-xs text-muted-foreground">
            Collection rate: {(d.collection_rate * 100).toFixed(1)}%. This is a revenue &amp;
            collections summary — not a full P&amp;L (v1 does not capture expense data).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const t =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${t}`}>{value}</p>
    </div>
  );
}

function AgingBars({ aging }: { aging: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(aging));
  const buckets: Array<[string, string]> = [
    ["current", "Current"],
    ["0-30", "0–30 days"],
    ["31-60", "31–60 days"],
    ["60+", "60+ days"],
  ];
  return (
    <div className="space-y-2">
      {buckets.map(([k, label]) => (
        <div key={k}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span>{label}</span>
            <span className="font-mono">{formatInr(aging[k] ?? 0)}</span>
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className={
                k === "60+"
                  ? "h-full rounded bg-destructive"
                  : k === "31-60"
                    ? "h-full rounded bg-warning"
                    : k === "0-30"
                      ? "h-full rounded bg-info"
                      : "h-full rounded bg-success"
              }
              style={{ width: `${((aging[k] ?? 0) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
