import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ChartColumn, UserRound, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MoveOutNotice, ResidentCounts } from "@/lib/property-residents";
import type { PropertyOverviewStats } from "@/lib/property-overview.functions";
import { cn } from "@/lib/utils";

/** "96%", or "0.7%" for shares under 1% so small groups don't read as 0. */
function share(value: number, total: number) {
  if (total <= 0) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** Residents by status: Active / Applicants / Notice given / Moved out. */
export function ResidentInsightsCard({
  counts,
  isLoading,
}: {
  counts?: ResidentCounts;
  isLoading?: boolean;
}) {
  const c = counts ?? { total: 0, active: 0, applicants: 0, noticeGiven: 0, movedOut: 0 };
  const slices = [
    { key: "active", label: "Active", value: c.active, fill: "var(--success)", dot: "bg-success" },
    {
      key: "applicants",
      label: "Applicants",
      value: c.applicants,
      fill: "var(--info)",
      dot: "bg-info",
    },
    {
      key: "notice",
      label: "Notice given",
      value: c.noticeGiven,
      fill: "var(--warning)",
      dot: "bg-warning",
    },
    {
      key: "moved",
      label: "Moved out",
      value: c.movedOut,
      fill: "var(--muted-foreground)",
      dot: "bg-muted-foreground",
    },
  ];
  const ringTotal = slices.reduce((s, x) => s + x.value, 0);
  const ring =
    ringTotal > 0
      ? slices.filter((s) => s.value > 0)
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <ChartColumn className="h-5 w-5 text-primary" aria-hidden="true" />
          Resident insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative h-[150px] w-[150px] shrink-0">
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
                    {c.total.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.total === 1 ? "Resident" : "Residents"}
                  </p>
                </div>
              </div>
            </div>
            <ul className="w-full space-y-2.5 text-sm" aria-label="Residents by status">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {s.value.toLocaleString("en-IN")}
                  </span>
                  <span className="w-14 text-right text-muted-foreground tabular-nums">
                    ({share(s.value, c.total)})
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

const fmtDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** The next residents to leave (notice given), soonest first. */
export function MoveOutNoticesCard({
  notices,
  total,
  isLoading,
  isError,
}: {
  notices: MoveOutNotice[];
  total: number;
  isLoading?: boolean;
  isError?: boolean;
}) {
  return (
    <Card className="flex flex-1 flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          Move-out notices
        </CardTitle>
        {total > 0 ? (
          <Link
            to="/admin/students"
            search={{ status: "NOTICE_GIVEN" }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Couldn’t load move-out notices. Please refresh to try again.
          </p>
        ) : notices.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one has given notice.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {notices.slice(0, 3).map((n) => (
              <li key={n.id}>
                <Link
                  to="/admin/students/$id"
                  params={{ id: n.studentId }}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="truncate font-medium">{n.name}</span>
                  <span className="text-muted-foreground">{n.room ?? "—"}</span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {n.date ? fmtDate(n.date) : "Date not set"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Active residents split by gender as one horizontal bar. */
export function GenderOccupancyCard({
  gender,
  isLoading,
}: {
  gender?: PropertyOverviewStats["gender"];
  isLoading?: boolean;
}) {
  const g = gender ?? { boys: 0, girls: 0, others: 0, notSpecified: 0 };
  const parts = [
    { key: "male", label: "Male", value: g.boys, bar: "bg-chart-cat-1", text: "text-card" },
    { key: "female", label: "Female", value: g.girls, bar: "bg-chart-cat-2", text: "text-card" },
    { key: "other", label: "Other", value: g.others, bar: "bg-chart-cat-3", text: "text-card" },
    {
      key: "unknown",
      label: "Not recorded",
      value: g.notSpecified,
      bar: "bg-muted-foreground/50",
      text: "text-card",
    },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  const legend = parts.filter((p) => p.key === "male" || p.key === "female" || p.value > 0);

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Occupancy by gender
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <>
            <div
              className="flex h-9 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`Active residents by gender: ${legend.map((p) => `${p.label} ${p.value}`).join(", ")}.`}
            >
              {total > 0
                ? parts
                    .filter((p) => p.value > 0)
                    .map((p, i, arr) => (
                      <span
                        key={p.key}
                        className={cn(
                          "flex h-full items-center justify-center text-sm font-semibold tabular-nums",
                          p.bar,
                          p.text,
                          i < arr.length - 1 && "border-r-2 border-card",
                        )}
                        style={{ width: `${(p.value / total) * 100}%` }}
                      >
                        {p.value / total >= 0.12 ? share(p.value, total) : null}
                      </span>
                    ))
                : null}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm" aria-label="Gender counts">
              {legend.map((p) => (
                <li key={p.key} className="flex items-center gap-2.5">
                  <span className={cn("h-3 w-3 rounded-full", p.bar)} aria-hidden="true" />
                  <span className="text-muted-foreground">{p.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {p.value.toLocaleString("en-IN")}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    ({share(p.value, total)})
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Active residents only.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
