import { useId, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ChartColumn, ChartPie, type LucideIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart,
  Cell,
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
import {
  TODAY_STATUS_META,
  TODAY_STATUS_ORDER,
  TREND_RANGES,
  shareOf,
  type AttendanceDayPoint,
  type PropertyAttendanceToday,
  type TrendRange,
} from "@/lib/property-attendance";
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
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-2">
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

function ChartError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const PCT_TICKS = [0, 20, 40, 60, 80, 100];

/* ------------------------------------------------------------------ trend */

interface TrendDatum extends AttendanceDayPoint {
  /** Bar height: the % or 0 for a day with nothing marked (still drawn). */
  value: number;
  label: string;
}

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = active ? (payload?.[0]?.payload as TrendDatum | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">
        {format(parseISO(point.date), "EEE, d MMM yyyy")}
      </p>
      {point.pct == null ? (
        <p className="mt-1 text-muted-foreground">Nothing marked this day</p>
      ) : (
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          <p className="flex items-center justify-between gap-4">
            Attendance
            <span className="font-semibold text-foreground tabular-nums">{point.pct}%</span>
          </p>
          <p className="flex items-center justify-between gap-4">
            Present + late
            <span className="font-semibold text-foreground tabular-nums">{point.attended}</span>
          </p>
          <p className="flex items-center justify-between gap-4">
            Absent
            <span className="font-semibold text-foreground tabular-nums">{point.absent}</span>
          </p>
          {point.onLeave > 0 ? (
            <p className="flex items-center justify-between gap-4">
              On leave
              <span className="font-semibold text-foreground tabular-nums">{point.onLeave}</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Attendance % per property-local day for the last 7 / 30 days. */
export function AttendanceTrendCard({
  range,
  onRangeChange,
  points,
  isLoading,
  isRefreshing,
  isError,
  onRetry,
}: {
  range: TrendRange;
  onRangeChange: (r: TrendRange) => void;
  points?: AttendanceDayPoint[];
  isLoading?: boolean;
  /** The previous range's points are showing while the new range loads. */
  isRefreshing?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const gradientId = `att-trend-${useId().replace(/:/g, "")}`;
  const data: TrendDatum[] = (points ?? []).map((p) => ({
    ...p,
    value: p.pct ?? 0,
    label: p.pct == null ? "" : `${p.pct}%`,
  }));
  // Axis format, bar gap and labels follow the points on screen, not the selected
  // range, so the previous range's bars keep their own layout while the next loads.
  const isShort = data.length <= 10;
  const marked = data.filter((d) => d.pct != null);

  return (
    <ChartCard
      icon={ChartColumn}
      title="Attendance trend"
      action={
        <Select value={String(range)} onValueChange={(v) => onRangeChange(v === "30" ? 30 : 7)}>
          <SelectTrigger className="h-8 w-[132px] text-xs" aria-label="Attendance trend period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {TREND_RANGES.map((r) => (
              <SelectItem key={r.value} value={String(r.value)} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : isError ? (
        <ChartError text="Couldn’t load the attendance trend." onRetry={onRetry} />
      ) : (
        <>
          <div
            className={cn(
              "h-[230px] min-h-[230px] w-full flex-1 transition-opacity",
              isRefreshing && "opacity-70",
            )}
            role="img"
            aria-busy={isRefreshing || undefined}
            aria-label={`Attendance per day over the last ${data.length} days: ${
              marked.length
                ? marked.map((d) => `${format(parseISO(d.date), "d MMM")} ${d.pct}%`).join(", ")
                : "nothing marked"
            }.`}
          >
            <ResponsiveContainer>
              <BarChart
                data={data}
                margin={{ top: 22, right: 8, bottom: 0, left: 0 }}
                barCategoryGap={isShort ? "28%" : "18%"}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  tickFormatter={(d: string) => format(parseISO(d), isShort ? "EEE" : "d MMM")}
                  interval={isShort ? 0 : "preserveStartEnd"}
                  minTickGap={isShort ? 4 : 24}
                  tickMargin={8}
                />
                <YAxis
                  width={42}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  ticks={PCT_TICKS}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="value"
                  fill={`url(#${gradientId})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={52}
                  isAnimationActive={false}
                >
                  {isShort ? (
                    <LabelList
                      dataKey="label"
                      position="top"
                      offset={6}
                      className="fill-foreground text-xs font-semibold"
                    />
                  ) : null}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {marked.length === 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              No attendance marked in this period yet.
            </p>
          ) : null}
        </>
      )}
    </ChartCard>
  );
}

/* ----------------------------------------------------------------- donut */

/** Active residents by today's status (share of all active residents). */
export function AttendanceStatusCard({
  today,
  isLoading,
  isError,
  onRetry,
}: {
  today?: PropertyAttendanceToday;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const total = today?.residents ?? 0;
  const slices = TODAY_STATUS_ORDER.map((s) => ({
    key: s,
    ...TODAY_STATUS_META[s],
    value: today?.counts[s] ?? 0,
  })).filter((s) => s.value > 0 || s.key !== "OUT_PASS");
  const ring =
    total > 0
      ? slices.filter((s) => s.value > 0).map((s) => ({ key: s.key, value: s.value, fill: s.fill }))
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <ChartCard icon={ChartPie} title="Today’s status">
      {isLoading ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : isError ? (
        <ChartError text="Couldn’t load today’s status." onRetry={onRetry} />
      ) : (
        // The row layout follows the card's own width (it sits in a three-column
        // grid at 2xl), so the donut and legend stack until they both fit.
        <div className="@container flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-5 @[24rem]:flex-row">
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
                    {total === 1 ? "Resident" : "Residents"}
                  </p>
                </div>
              </div>
            </div>
            <div className="w-full max-w-[240px]">
              <ul className="space-y-2.5 text-sm" aria-label="Residents by status today">
                {slices.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.key} className="flex items-center gap-2.5">
                      <span
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)}
                        aria-hidden="true"
                      />
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-foreground">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.value.toLocaleString("en-IN")}
                      </span>
                      <span className="w-11 text-right font-semibold text-foreground tabular-nums">
                        {shareOf(s.value, total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {total === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">No active residents yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
