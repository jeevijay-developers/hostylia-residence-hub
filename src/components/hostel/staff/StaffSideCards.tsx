import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  Loader2,
  UserCog,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DESIGNATION_LABEL, type StaffDesignation } from "@/lib/property-staff";
import { cn } from "@/lib/utils";

// Categorical series only (never status colours): the three chart tokens and
// primary for the four biggest roles, muted for everything else.
const SERIES = [
  { fill: "var(--chart-cat-1)", dot: "bg-chart-cat-1" },
  { fill: "var(--chart-cat-2)", dot: "bg-chart-cat-2" },
  { fill: "var(--chart-cat-3)", dot: "bg-chart-cat-3" },
  { fill: "var(--primary)", dot: "bg-primary" },
];
const OTHERS = { fill: "var(--muted-foreground)", dot: "bg-muted-foreground" };

/** Staff by role: a donut of the four biggest designations + "Others", total in the centre. */
export function StaffByRoleCard({
  counts,
  isLoading,
  isError,
}: {
  counts: Partial<Record<StaffDesignation, number>>;
  isLoading?: boolean;
  /** The roster failed to load: say so instead of showing an empty split. */
  isError?: boolean;
}) {
  const entries = (Object.entries(counts) as [StaffDesignation, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || DESIGNATION_LABEL[a[0]].localeCompare(DESIGNATION_LABEL[b[0]]));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const top = entries.length > 5 ? entries.slice(0, 4) : entries;
  const rest = entries.length > 5 ? entries.slice(4) : [];
  const slices = [
    ...top.map(([d, n], i) => ({
      key: d,
      label: DESIGNATION_LABEL[d],
      value: n,
      title: undefined as string | undefined,
      ...(SERIES[i] ?? OTHERS),
    })),
    ...(rest.length
      ? [
          {
            key: "OTHERS",
            label: "Others",
            value: rest.reduce((s, [, n]) => s + n, 0),
            title: rest.map(([d, n]) => `${DESIGNATION_LABEL[d]} ${n}`).join(", "),
            ...OTHERS,
          },
        ]
      : []),
  ];
  const ring = total > 0 ? slices : [{ key: "empty", value: 1, fill: "var(--muted)" }];

  return (
    <Card className="flex flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Staff by role
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
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
                    {isError ? "—" : total.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">Staff</p>
                </div>
              </div>
            </div>
            {isError ? (
              <p className="w-full text-sm text-muted-foreground">
                Couldn’t load the split by role. Use Try again above.
              </p>
            ) : total === 0 ? (
              <p className="w-full text-sm text-muted-foreground">
                No staff yet. Add staff to see the split by role.
              </p>
            ) : (
              <ul className="w-full space-y-2.5 text-sm" aria-label="Staff by role">
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5" title={s.title}>
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-foreground">{s.label}</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {s.value.toLocaleString("en-IN")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const tileClass =
  "flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:text-sm";

function TileBody({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="leading-tight">{children}</span>
    </>
  );
}

/** Staff shortcuts. Each opens a real flow; Manage roles goes to Staff & permissions. */
export function StaffQuickActionsCard({
  onAddStaff,
  onAssignShift,
  onMarkAttendance,
  onLeaveRequests,
  onReports,
  isExporting,
}: {
  onAddStaff: () => void;
  onAssignShift: () => void;
  onMarkAttendance: () => void;
  onLeaveRequests: () => void;
  onReports: () => void;
  isExporting?: boolean;
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
          <button type="button" className={tileClass} onClick={onAddStaff}>
            <TileBody icon={UserPlus}>Add staff</TileBody>
          </button>
          <button type="button" className={tileClass} onClick={onAssignShift}>
            <TileBody icon={CalendarRange}>Assign shift</TileBody>
          </button>
          <button type="button" className={tileClass} onClick={onMarkAttendance}>
            <TileBody icon={CalendarCheck}>Mark attendance</TileBody>
          </button>
          <Link
            to="/admin/staff"
            className={tileClass}
            title="App access and permissions for Warden and Accountant logins"
          >
            <TileBody icon={UserCog}>Manage roles</TileBody>
          </Link>
          <button type="button" className={tileClass} onClick={onLeaveRequests}>
            <TileBody icon={CalendarClock}>Leave requests</TileBody>
          </button>
          <button
            type="button"
            className={tileClass}
            onClick={onReports}
            disabled={isExporting}
            title="Download the staff directory with this month's attendance (CSV)"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                <span className="leading-tight">Preparing…</span>
              </>
            ) : (
              <TileBody icon={ChartColumn}>Staff reports</TileBody>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
