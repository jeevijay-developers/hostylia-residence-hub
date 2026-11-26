import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Minus, Triangle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatDelta {
  /** Signed change; sign picks the icon/tone, 0 renders neutral. */
  value: number;
  /** Visible text, e.g. "+14%" or "+2 pp". */
  label: string;
  /** Screen-reader context, e.g. "vs the same days last month". */
  description: string;
}

interface DashboardStatCardProps {
  icon: LucideIcon;
  label: string;
  value?: ReactNode;
  /** Exact value for the tooltip when `value` is abbreviated (e.g. ₹12.48L). */
  valueTitle?: string;
  isLoading?: boolean;
  delta?: StatDelta | null;
  /** Small muted line under the value when there is no delta/footer story to tell. */
  caption?: ReactNode;
  footer?: ReactNode;
  onNavigate: () => void;
}

/**
 * Change indicator: ▲/▼ + colour + text, never colour alone. `plain` is the
 * text-only style used on the KPI tiles; the default is a soft pill.
 */
export function DeltaPill({
  delta,
  plain,
  className,
}: {
  delta: StatDelta;
  plain?: boolean;
  className?: string;
}) {
  const up = delta.value > 0;
  const down = delta.value < 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums",
        !plain && "rounded-full px-2 py-0.5",
        up && (plain ? "text-success" : "bg-success/10 text-success"),
        down && (plain ? "text-destructive" : "bg-destructive/10 text-destructive"),
        !up && !down && (plain ? "text-muted-foreground" : "bg-muted text-muted-foreground"),
        className,
      )}
      title={delta.description}
    >
      {up || down ? (
        <Triangle
          className={cn("h-2.5 w-2.5 fill-current", down && "rotate-180")}
          aria-hidden="true"
        />
      ) : (
        <Minus className="h-3 w-3" aria-hidden="true" />
      )}
      {delta.label}
      <span className="sr-only"> {delta.description}</span>
    </span>
  );
}

/** Admin dashboard KPI tile. The whole tile is a button into the detail view it summarises. */
export function DashboardStatCard({
  icon: Icon,
  label,
  value,
  valueTitle,
  isLoading,
  delta,
  caption,
  footer,
  onNavigate,
}: DashboardStatCardProps) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="group flex min-h-[132px] w-full flex-col rounded-2xl border border-border/80 bg-card p-4 text-left shadow-card-ambient transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p
                className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground tabular-nums"
                title={valueTitle}
              >
                {value ?? "—"}
              </p>
            )}
            {!isLoading && delta ? <DeltaPill delta={delta} plain /> : null}
          </div>
        </div>
      </div>
      {!isLoading && (footer || caption) ? (
        <div className="mt-auto pt-3">
          {footer}
          {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
        </div>
      ) : null}
    </button>
  );
}

export function StatProgress({ percent, label }: { percent: number; label: string }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

/**
 * Decorative trend line (the full chart with axes/tooltips lives in the
 * Collections card). Always drawn: with no data yet it is a flat line on the
 * baseline rather than an empty gap.
 */
export function StatSparkline({ values, id }: { values: number[]; id: string }) {
  const series = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const data = series.map((v, i) => ({ i, v }));
  const gradientId = `spark-${id}`;
  return (
    <div className="h-10 w-full" aria-hidden="true">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 3, right: 1, bottom: 1, left: 1 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, (max: number) => (max > 0 ? max : 1)]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--primary)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
