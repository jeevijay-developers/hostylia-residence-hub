import { useId } from "react";
import { IndianRupee } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeltaPill } from "@/components/dashboard/admin/DashboardStatCard";
import { formatInr, formatInrCompact } from "@/lib/finance";
import type { CollectionsPoint, CollectionsRange, CollectionsSummary } from "@/lib/admin-dashboard";

interface CollectionsTrendCardProps {
  range: CollectionsRange;
  onRangeChange: (range: CollectionsRange) => void;
  data?: CollectionsSummary;
  isLoading?: boolean;
  isError?: boolean;
}

const RANGE_LABEL: Record<CollectionsRange, string> = {
  "this-month": "This month",
  "last-month": "Last month",
};

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = active ? (payload?.[0]?.payload as CollectionsPoint | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
        Collected that day
        <span className="font-semibold text-foreground tabular-nums">
          {formatInr(point.dailyPaise)}
        </span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        Running total
        <span className="font-semibold text-foreground tabular-nums">
          {formatInr(point.cumulativePaise)}
        </span>
      </p>
    </div>
  );
}

/**
 * Running total of captured payments (simulated test payments excluded — the
 * same rule as the Collections KPI) across the selected month. Collections
 * only, not P&L: no expense data is involved.
 */
export function CollectionsTrendCard({
  range,
  onRangeChange,
  data,
  isLoading,
  isError,
}: CollectionsTrendCardProps) {
  const gradientId = `collections-fill-${useId().replace(/:/g, "")}`;
  const points = data?.points ?? [];
  const lastIndex = points.length - 1;
  const comparison = range === "this-month" ? "vs the same days last month" : "vs the month before";

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <IndianRupee className="h-5 w-5 text-primary" aria-hidden="true" />
          Collections
        </CardTitle>
        <Select value={range} onValueChange={(v) => onRangeChange(v as CollectionsRange)}>
          <SelectTrigger className="h-8 w-[136px] text-xs" aria-label="Collections period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(RANGE_LABEL) as CollectionsRange[]).map((r) => (
              <SelectItem key={r} value={r} className="text-xs">
                {RANGE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-40" />
            <Skeleton className="mt-4 h-[200px] w-full rounded-xl" />
          </>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load collections right now. Please refresh to try again.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p
                className="font-display text-3xl font-semibold tracking-tight text-foreground tabular-nums"
                title={formatInr(data?.totalPaise ?? 0)}
              >
                {formatInrCompact(data?.totalPaise ?? 0)}
              </p>
              {data?.deltaPct != null ? (
                <DeltaPill
                  delta={{
                    value: data.deltaPct,
                    label: `${data.deltaPct > 0 ? "+" : ""}${data.deltaPct}%`,
                    description: comparison,
                  }}
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {(data?.totalPaise ?? 0) === 0
                ? `No payments captured ${range === "this-month" ? "this month yet" : "last month"}`
                : data?.deltaPct != null
                  ? `${comparison.charAt(0).toUpperCase()}${comparison.slice(1)} (${formatInrCompact(data.previousPaise)})`
                  : "Captured payments, excluding test payments"}
            </p>

            {/* Always drawn — with no payments it is a flat line on a ₹0–10K scale. */}
            <div
              className="mt-4 h-[210px] w-full flex-1"
              role="img"
              aria-label={`Collections running total for ${RANGE_LABEL[range].toLowerCase()}: ${formatInr(data?.totalPaise ?? 0)}.`}
            >
              <ResponsiveContainer>
                <AreaChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                    tickMargin={8}
                  />
                  <YAxis
                    width={44}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v: number) => formatInrCompact(v, { symbol: false })}
                    allowDecimals={false}
                    domain={[0, (max: number) => (max > 0 ? Math.ceil(max * 1.1) : 1_000_000)]}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeOpacity: 0.4,
                      strokeDasharray: "3 3",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePaise"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                    activeDot={{
                      r: 5,
                      fill: "var(--primary)",
                      stroke: "var(--card)",
                      strokeWidth: 2,
                    }}
                    dot={(props: { cx?: number; cy?: number; index?: number }) =>
                      props.index === lastIndex && props.cx != null && props.cy != null ? (
                        <circle
                          key="last"
                          cx={props.cx}
                          cy={props.cy}
                          r={4.5}
                          fill="var(--card)"
                          stroke="var(--primary)"
                          strokeWidth={2}
                        />
                      ) : (
                        <g key={`d-${props.index}`} />
                      )
                    }
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
