import { ChartPie } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { StudentStatusDot } from "@/components/hostel/students/StudentStatusPill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudentCounts } from "@/lib/property-students";

/** "96%", or "0.7%" for shares under 1% so small groups don't read as 0. */
function share(value: number, total: number) {
  if (total <= 0) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** Live students by lifecycle status, as a donut with a legend of counts and shares. */
export function StudentStatusCard({
  counts,
  isLoading,
  isError,
}: {
  counts?: StudentCounts;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const c = counts;
  const slices = c
    ? ([
        { key: "active", label: "Active", value: c.active, fill: "var(--success)", meta: "ACTIVE" },
        {
          key: "applicant",
          label: "Applicants",
          value: c.applicant,
          fill: "var(--info)",
          meta: "APPLICANT",
        },
        {
          key: "verified",
          label: "Verified",
          value: c.verified,
          fill: "var(--chart-cat-2)",
          meta: "VERIFIED",
        },
        {
          key: "notice",
          label: "Notice given",
          value: c.noticeGiven,
          fill: "var(--warning)",
          meta: "NOTICE_GIVEN",
        },
        {
          key: "moved",
          label: "Moved out",
          value: c.movedOut,
          fill: "var(--muted-foreground)",
          meta: "MOVED_OUT",
        },
      ] as const)
    : [];
  const total = c?.total ?? 0;
  const ringTotal = slices.reduce((s, x) => s + x.value, 0);
  const ring =
    ringTotal > 0
      ? slices.filter((s) => s.value > 0).map((s) => ({ key: s.key, value: s.value, fill: s.fill }))
      : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <ChartPie className="h-5 w-5 text-primary" aria-hidden="true" />
          Student status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[150px] w-full rounded-xl" />
        ) : isError || !c ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="alert">
            Couldn’t load the status breakdown. Please refresh to try again.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div
              className="relative h-[140px] w-[140px] shrink-0"
              role="img"
              aria-label={`${total} students: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}.`}
            >
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
                  <p className="text-xs text-muted-foreground">
                    {total === 1 ? "Student" : "Students"}
                  </p>
                </div>
              </div>
            </div>
            <ul className="w-full space-y-2.5 text-sm" aria-label="Students by status">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5">
                  <StudentStatusDot status={s.meta} className="h-2.5 w-2.5" />
                  <span className="flex-1 text-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {s.value.toLocaleString("en-IN")}
                  </span>
                  <span className="w-14 text-right text-muted-foreground tabular-nums">
                    ({share(s.value, total)})
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
