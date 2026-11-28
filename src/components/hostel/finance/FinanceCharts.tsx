import { useId, type ReactNode } from "react";
import { ChartColumn, ChartPie, type LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr, formatInrCompact } from "@/lib/finance";
import {
  sharePct,
  type BreakdownSlice,
  type FinanceCollections,
  type FinanceRange,
  type TrendPoint,
} from "@/lib/property-finance";
import { cn } from "@/lib/utils";

function ChartCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

function ChartError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

/**
 * Evenly spaced axis ticks from 0 on a 1/2/5×10ⁿ step (₹2L, ₹4L … not ₹1.73L).
 * With nothing collected the axis is ₹0–₹10K so the flat line still reads.
 */
function niceTicks(values: number[], count = 5): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return [0, 250_000, 500_000, 750_000, 1_000_000];
  const raw = max / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= hi; t += step) ticks.push(t);
  return ticks;
}

const RANGE_LABEL: Record<FinanceRange, string> = {
  "this-month": "This month",
  "last-month": "Last month",
};

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
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
 * Running total of captured payments (test payments excluded) per IST day of
 * the selected month. Collections only — not P&L.
 */
export function PaymentTrendCard({
  range,
  onRangeChange,
  data,
  isLoading,
  isError,
  onRetry,
}: {
  range: FinanceRange;
  onRangeChange: (r: FinanceRange) => void;
  data?: FinanceCollections;
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
}) {
  const gradientId = `finance-trend-${useId().replace(/:/g, "")}`;
  const points = data?.points ?? [];
  const lastIndex = points.length - 1;
  const ticks = niceTicks(points.map((p) => p.cumulativePaise));
  const total = data?.totalPaise ?? 0;

  return (
    <ChartCard
      icon={ChartColumn}
      title="Payment trend"
      action={
        <Select value={range} onValueChange={(v) => onRangeChange(v as FinanceRange)}>
          <SelectTrigger className="h-8 w-[128px] text-xs" aria-label="Payment trend period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(RANGE_LABEL) as FinanceRange[]).map((r) => (
              <SelectItem key={r} value={r} className="text-xs">
                {RANGE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : isError ? (
        <ChartError text="Couldn’t load the payment trend." onRetry={onRetry} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {total > 0 ? (
              <>
                <span
                  className="font-semibold text-foreground tabular-nums"
                  title={formatInr(total)}
                >
                  {formatInrCompact(total)}
                </span>{" "}
                collected {range === "this-month" ? "so far this month" : "last month"} ·{" "}
                {data?.paymentCount ?? 0} payment{data?.paymentCount === 1 ? "" : "s"}
              </>
            ) : (
              `No payments captured ${range === "this-month" ? "this month yet" : "last month"}`
            )}
          </p>
          <div
            className="mt-3 h-[210px] w-full flex-1"
            role="img"
            aria-label={`Running total of collections for ${RANGE_LABEL[range].toLowerCase()}: ${formatInr(total)}.`}
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
                  tick={axisTick}
                  interval="preserveStartEnd"
                  minTickGap={28}
                  tickMargin={8}
                />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  ticks={ticks}
                  domain={[0, ticks.at(-1) ?? 1]}
                  tickFormatter={(v: number) => formatInrCompact(v, { symbol: false })}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<TrendTooltip />}
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
    </ChartCard>
  );
}

const SLICE_STYLE = [
  { fill: "var(--chart-cat-1)", dot: "bg-chart-cat-1" },
  { fill: "var(--chart-cat-2)", dot: "bg-chart-cat-2" },
  { fill: "var(--chart-cat-3)", dot: "bg-chart-cat-3" },
];
const REST_STYLE = { fill: "var(--muted-foreground)", dot: "bg-muted-foreground" };

/**
 * This month's collections split by the fee plan of the invoice each payment
 * settled. The three largest groups get their own colour; the rest share one.
 */
export function CollectionBreakdownCard({
  breakdown,
  totalPaise,
  isLoading,
  isError,
  onRetry,
}: {
  breakdown?: BreakdownSlice[];
  totalPaise: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
}) {
  const groups = breakdown ?? [];
  const top = groups.slice(0, 3).map((g, i) => ({ ...g, ...SLICE_STYLE[i] }));
  const rest = groups.slice(3);
  const slices =
    rest.length > 0
      ? [
          ...top,
          {
            key: "rest",
            label: rest.length === 1 ? rest[0].label : `${rest.length} other groups`,
            paise: rest.reduce((s, g) => s + g.paise, 0),
            ...REST_STYLE,
          },
        ]
      : top;
  const ring =
    totalPaise > 0
      ? slices.filter((s) => s.paise > 0).map((s) => ({ key: s.key, value: s.paise, fill: s.fill }))
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <ChartCard icon={ChartPie} title="Collection breakdown">
      {isLoading ? (
        <Skeleton className="h-[200px] w-full rounded-xl" />
      ) : isError ? (
        <ChartError text="Couldn’t load the collection breakdown." onRetry={onRetry} />
      ) : (
        // Row vs column follows the card's own width, not the viewport: in the
        // three-column 2xl grid the card is too narrow for donut + legend side by side.
        <div className="@container flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center gap-5 @[26rem]:flex-row">
            <div className="relative h-[170px] w-[170px] shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={ring}
                    dataKey="value"
                    nameKey="key"
                    innerRadius="72%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={ring.length > 1 ? 2 : 0}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {ring.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p
                    className="font-display text-2xl font-semibold text-foreground tabular-nums"
                    title={formatInr(totalPaise)}
                  >
                    {formatInrCompact(totalPaise)}
                  </p>
                  <p className="text-xs text-muted-foreground">Collected MTD</p>
                </div>
              </div>
            </div>
            {totalPaise > 0 ? (
              <ul
                className="w-full min-w-0 space-y-2.5 text-sm"
                aria-label="Collections by fee plan"
              >
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5">
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground" title={s.label}>
                      {s.label}
                    </span>
                    <span
                      className="whitespace-nowrap text-muted-foreground tabular-nums"
                      title={formatInr(s.paise)}
                    >
                      {formatInrCompact(s.paise)}
                    </span>
                    <span className="w-11 text-right font-semibold text-foreground tabular-nums">
                      {sharePct(s.paise, totalPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="w-full text-center text-sm text-muted-foreground @[26rem]:text-left">
                No payments captured this month yet. Collections will be split here by fee plan.
              </p>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
