import { useId, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Building2, ChartPie, TrendingUp, type LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
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
import type {
  PropertyOverviewStats,
  StudentTrendPoint,
  StudentTrendRange,
} from "@/lib/property-overview.functions";
import { cn } from "@/lib/utils";

function ChartCard({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient",
        className,
      )}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
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

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

/**
 * Evenly spaced whole-number ticks on a 1/2/5×10ⁿ step (e.g. 360, 380 … 460),
 * so axes never show odd values like 173 or 469. With `fromZero` the base is
 * pinned at 0 (bars); otherwise the axis hugs the data (a trend line).
 */
function niceTicks(values: number[], fromZero: boolean, count = 5): number[] {
  const max = Math.max(0, ...values);
  const min = fromZero ? 0 : Math.min(...values, max);
  if (max === 0) return [0, 2, 4, 6, 8, 10];
  const raw = Math.max(1, (max - min) / (count - 1));
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  let lo = fromZero ? 0 : Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  // Headroom above the tallest bar for its value label.
  if (fromZero && hi === max) hi += step;
  // A trend line always gets a full axis, even for flat data (12 students every day).
  while (!fromZero && (hi - lo) / step < count - 1) {
    if (lo - step >= 0 && ((hi - lo) / step) % 2 === 1) lo -= step;
    else hi += step;
  }
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return ticks;
}

function ChartMessage({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>;
}

/* ------------------------------------------------------------------ trend */

const RANGE_LABEL: Record<StudentTrendRange, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = active ? (payload?.[0]?.payload as StudentTrendPoint | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{format(parseISO(point.date), "d MMM yyyy")}</p>
      <p className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
        Students staying
        <span className="font-semibold text-foreground tabular-nums">
          {point.students.toLocaleString("en-IN")}
        </span>
      </p>
    </div>
  );
}

export function StudentTrendCard({
  range,
  onRangeChange,
  points,
  isLoading,
  isError,
}: {
  range: StudentTrendRange;
  onRangeChange: (r: StudentTrendRange) => void;
  points?: StudentTrendPoint[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  const gradientId = `trend-fill-${useId().replace(/:/g, "")}`;
  const data = points ?? [];
  const lastIndex = data.length - 1;
  const tickFormat = range === "12m" ? "MMM" : "d MMM";
  const latest = data.at(-1)?.students ?? 0;
  const trendTicks = niceTicks(
    data.map((p) => p.students),
    false,
  );

  return (
    <ChartCard
      icon={TrendingUp}
      title="Student trend"
      action={
        <Select value={range} onValueChange={(v) => onRangeChange(v as StudentTrendRange)}>
          <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Student trend period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(RANGE_LABEL) as StudentTrendRange[]).map((r) => (
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
        <ChartMessage>Couldn’t load the trend right now. Please refresh to try again.</ChartMessage>
      ) : (
        // Always drawn: with no stays yet it is a flat line at 0.
        <div
          className="h-[230px] min-h-[230px] w-full flex-1"
          role="img"
          aria-label={`Students staying over the ${RANGE_LABEL[range].toLowerCase()}: ${latest} today.`}
        >
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                tickFormatter={(d: string) => format(parseISO(d), tickFormat)}
                interval="preserveStartEnd"
                minTickGap={32}
                tickMargin={8}
              />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                allowDecimals={false}
                ticks={trendTicks}
                domain={[trendTicks[0] ?? 0, trendTicks.at(-1) ?? 10]}
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
                dataKey="students"
                stroke="var(--primary)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
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
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------ block-wise */

type BlockRow = PropertyOverviewStats["blockwise"][number];

function BlockTooltip({ active, payload }: TooltipProps<number, string>) {
  const row = active ? (payload?.[0]?.payload as BlockRow | undefined) : undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{row.name}</p>
      <p className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
        Students
        <span className="font-semibold text-foreground tabular-nums">
          {row.students.toLocaleString("en-IN")}
        </span>
      </p>
    </div>
  );
}

export function BlockwiseStudentsCard({
  rows,
  isLoading,
  isError,
}: {
  rows?: BlockRow[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  const gradientId = `block-fill-${useId().replace(/:/g, "")}`;
  const data = rows ?? [];
  const blockTicks = niceTicks(
    data.map((r) => r.students),
    true,
  );
  return (
    <ChartCard icon={Building2} title="Block-wise students">
      {isLoading ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : isError ? (
        <ChartMessage>Couldn’t load blocks right now. Please refresh to try again.</ChartMessage>
      ) : (
        <div
          className="h-[230px] min-h-[230px] w-full flex-1"
          role="img"
          aria-label={`Students per block: ${data.map((r) => `${r.name} ${r.students}`).join(", ")}.`}
        >
          <ResponsiveContainer>
            <BarChart
              data={data}
              margin={{ top: 22, right: 8, bottom: 0, left: 0 }}
              barCategoryGap="28%"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                interval={0}
                tickMargin={8}
                tickFormatter={(n: string) => (n.length > 12 ? `${n.slice(0, 11)}…` : n)}
              />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                allowDecimals={false}
                ticks={blockTicks}
                domain={[0, blockTicks.at(-1) ?? 10]}
              />
              <Tooltip content={<BlockTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
              <Bar
                dataKey="students"
                fill={`url(#${gradientId})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
                isAnimationActive={false}
              >
                {data.length <= 8 ? (
                  <LabelList
                    dataKey="students"
                    position="top"
                    offset={6}
                    className="fill-foreground text-xs font-semibold"
                  />
                ) : null}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/* ---------------------------------------------------------- distribution */

export function StudentDistributionCard({
  gender,
  isLoading,
  isError,
}: {
  gender?: PropertyOverviewStats["gender"];
  isLoading?: boolean;
  isError?: boolean;
}) {
  const g = gender ?? { boys: 0, girls: 0, others: 0, notSpecified: 0 };
  const total = g.boys + g.girls + g.others + g.notSpecified;
  const slices = [
    {
      key: "boys",
      label: "Boys",
      value: g.boys,
      fill: "var(--chart-cat-1)",
      dot: "bg-chart-cat-1",
    },
    {
      key: "girls",
      label: "Girls",
      value: g.girls,
      fill: "var(--chart-cat-2)",
      dot: "bg-chart-cat-2",
    },
    {
      key: "others",
      label: "Others",
      value: g.others,
      fill: "var(--chart-cat-3)",
      dot: "bg-chart-cat-3",
    },
    ...(g.notSpecified > 0
      ? [
          {
            key: "unknown",
            label: "Not recorded",
            value: g.notSpecified,
            fill: "var(--muted-foreground)",
            dot: "bg-muted-foreground",
          },
        ]
      : []),
  ];
  const pctOf = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  // With nobody staying, a full grey ring keeps the card from looking broken.
  const ring =
    total > 0
      ? slices.filter((s) => s.value > 0)
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <ChartCard icon={ChartPie} title="Student distribution">
      {isLoading ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : isError ? (
        <ChartMessage>
          Couldn’t load the distribution right now. Please refresh to try again.
        </ChartMessage>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-5 sm:flex-row sm:justify-center xl:flex-col 2xl:flex-row">
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
                <p className="font-display text-3xl font-semibold text-foreground tabular-nums">
                  {total.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {total === 1 ? "Student" : "Students"}
                </p>
              </div>
            </div>
          </div>
          <ul className="w-full max-w-[220px] space-y-3 text-sm" aria-label="Students by gender">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className={cn("h-3 w-3 shrink-0 rounded-full", s.dot)} aria-hidden="true" />
                <span className="flex-1 text-foreground">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">{s.value}</span>
                <span className="w-10 text-right font-semibold text-foreground tabular-nums">
                  {pctOf(s.value)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
