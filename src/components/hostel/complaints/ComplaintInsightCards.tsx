import {
  ArrowRight,
  ChartPie,
  ChevronRight,
  Download,
  Flame,
  Loader2,
  Plus,
  UserPlus,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import {
  ComplaintPriorityPill,
  ComplaintSlaText,
} from "@/components/hostel/complaints/ComplaintBadges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComplaintStats, PropertyComplaint } from "@/lib/property-complaints";
import { cn } from "@/lib/utils";

/** "33%", or "0.7%" for small shares so they don't read as 0. */
function share(value: number, total: number) {
  if (total <= 0) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** Complaints by status group (the same groups as the status chips). */
export function ComplaintInsightsCard({
  stats,
  isLoading,
  isError,
}: {
  stats?: ComplaintStats;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const g = stats?.groups ?? { OPEN: 0, ASSIGNED: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
  const slices = [
    { key: "open", label: "Open", value: g.OPEN, fill: "var(--info)", dot: "bg-info" },
    {
      key: "progress",
      label: "In progress",
      value: g.IN_PROGRESS,
      fill: "var(--chart-cat-1)",
      dot: "bg-chart-cat-1",
    },
    {
      key: "assigned",
      label: "Assigned",
      value: g.ASSIGNED,
      fill: "var(--chart-cat-2)",
      dot: "bg-chart-cat-2",
    },
    {
      key: "resolved",
      label: "Resolved",
      value: g.RESOLVED,
      fill: "var(--success)",
      dot: "bg-success",
    },
    {
      key: "closed",
      label: "Closed",
      value: g.CLOSED,
      fill: "var(--muted-foreground)",
      dot: "bg-muted-foreground",
    },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const ring =
    total > 0
      ? slices.filter((s) => s.value > 0)
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <ChartPie className="h-5 w-5 text-primary" aria-hidden="true" />
          Complaint insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[150px] w-full rounded-xl" />
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Couldn’t load complaint insights. Please refresh to try again.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative h-[140px] w-[140px] shrink-0">
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
                  <p className="font-display text-2xl font-semibold text-foreground tabular-nums">
                    {total.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>
            {/* Label / share / count columns sized to their content, so labels never wrap. */}
            <ul
              className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-2 text-sm"
              aria-label="Complaints by status"
            >
              {slices.map((s) => (
                <li key={s.key} className="contents">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} aria-hidden="true" />
                  <span className="truncate text-foreground">{s.label}</span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {share(s.value, total)}
                  </span>
                  <span className="text-right font-semibold text-foreground tabular-nums">
                    ({s.value.toLocaleString("en-IN")})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Priority queue columns from the card's 21rem width: number, issue + SLA, priority, chevron. */
const QUEUE_GRID = "@[21rem]:grid-cols-[82px_minmax(0,1fr)_86px_16px]";

/** Open URGENT / HIGH complaints, soonest SLA first; View all filters the list to them. */
export function PriorityQueueCard({
  rows,
  total,
  isLoading,
  isError,
  onOpen,
  onViewAll,
}: {
  rows: PropertyComplaint[];
  total: number;
  isLoading?: boolean;
  isError?: boolean;
  onOpen: (c: PropertyComplaint) => void;
  onViewAll: () => void;
}) {
  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Flame className="h-5 w-5 text-destructive" aria-hidden="true" />
          Priority queue
          {total > 0 ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive tabular-nums">
              {total.toLocaleString("en-IN")}
            </span>
          ) : null}
        </CardTitle>
        {total > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Couldn’t load the priority queue. Please refresh to try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No urgent or high-priority complaints are open.
          </p>
        ) : (
          // A small table sized by the card's own width: fixed number / priority columns so every
          // row lines up, the SLA state as a line under the title. On a narrow card the number
          // moves above the title so the title keeps its room.
          <div className="@container">
            <div
              className={cn(
                "hidden gap-x-2 px-1 pb-1.5 text-xs font-medium text-muted-foreground @[21rem]:grid",
                QUEUE_GRID,
              )}
              aria-hidden="true"
            >
              <span>Complaint</span>
              <span>Issue / SLA</span>
              <span className="text-right">Priority</span>
              <span />
            </div>
            <ul className="divide-y divide-border/60 border-t border-border/60 @[21rem]:border-t-0">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    aria-label={`Open ${c.complaint_number}: ${c.title}`}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_86px_16px] items-center gap-x-2 gap-y-1 rounded-lg px-1 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      QUEUE_GRID,
                    )}
                  >
                    <span
                      className="col-start-1 row-start-1 truncate font-mono text-xs font-semibold text-foreground @[21rem]:col-auto @[21rem]:row-auto"
                      title={c.complaint_number}
                    >
                      {c.complaint_number}
                    </span>
                    <span className="col-start-1 row-start-2 block min-w-0 @[21rem]:col-auto @[21rem]:row-auto">
                      <span
                        className="block truncate text-sm font-medium text-foreground"
                        title={c.title}
                      >
                        {c.title}
                      </span>
                      <ComplaintSlaText complaint={c} className="mt-0.5" />
                    </span>
                    <span className="col-start-2 row-[1/span_2] flex min-w-0 justify-end @[21rem]:col-auto @[21rem]:row-auto">
                      <ComplaintPriorityPill priority={c.priority} />
                    </span>
                    <ChevronRight
                      className="col-start-3 row-[1/span_2] h-4 w-4 text-muted-foreground @[21rem]:col-auto @[21rem]:row-auto"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const tileClass =
  "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:text-sm";

function Tile({
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={tileClass} onClick={onClick} disabled={disabled} title={title}>
      <Icon
        className={cn("h-5 w-5 text-primary", Icon === Loader2 && "animate-spin")}
        aria-hidden="true"
      />
      <span className="leading-tight">{children}</span>
    </button>
  );
}

export function ComplaintQuickActionsCard({
  onNew,
  onAssign,
  onExport,
  isExporting,
}: {
  onNew: () => void;
  onAssign: () => void;
  onExport: () => void;
  isExporting: boolean;
}) {
  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Quick actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2.5">
          <Tile icon={Plus} onClick={onNew}>
            New complaint
          </Tile>
          <Tile icon={UserPlus} onClick={onAssign}>
            Assign warden
          </Tile>
          <Tile
            icon={isExporting ? Loader2 : Download}
            onClick={onExport}
            disabled={isExporting}
            title="Download the current filtered list as CSV"
          >
            Export
          </Tile>
        </div>
      </CardContent>
    </Card>
  );
}
