import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { BedDouble, Building2, Gauge, LayoutGrid, List, Plus, Users } from "lucide-react";

import occupancyTower from "@/assets/illustrations/occupancy-tower.webp";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { TableSkeleton } from "@/components/dashboard/TableSkeleton";
import {
  OccupancyRing,
  PropertyCard,
  PropertyStatusBadge,
  type PropertyQuickAction,
} from "@/components/hostel/PropertyCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyActionsMenu } from "@/components/hostel/PropertyActionsMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cleanPlace, usePropertiesOverview, type PropertyOverview } from "@/lib/admin-properties";
import { useResolvedRole } from "@/lib/user-role";
import { cn } from "@/lib/utils";
import { usePropertyStore } from "@/stores/property-store";

const STATUS_FILTERS = ["ALL", "ACTIVE", "DRAFT", "INACTIVE", "SUSPENDED"] as const;
const SORTS = ["occupancy-desc", "occupancy-asc", "name", "beds"] as const;
const VIEWS = ["grid", "list"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type SortKey = (typeof SORTS)[number];
type ViewMode = (typeof VIEWS)[number];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  DRAFT: "Setup pending",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

const SORT_LABEL: Record<SortKey, string> = {
  "occupancy-desc": "Occupancy (high to low)",
  "occupancy-asc": "Occupancy (low to high)",
  name: "Name (A–Z)",
  beds: "Most beds",
};

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return allowed.find((v) => v === value);
}

export const Route = createFileRoute("/_authenticated/admin/properties/")({
  head: () => ({ meta: [{ title: "Properties — Hostylia" }] }),
  // Filter, layout and sort live in the URL so they survive reloads and can be shared.
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: StatusFilter; view?: ViewMode; sort?: SortKey } => ({
    status: pick(STATUS_FILTERS, search.status),
    view: pick(VIEWS, search.view),
    sort: pick(SORTS, search.sort),
  }),
  component: PropertiesListPage,
});

function sortProperties(list: PropertyOverview[], sort: SortKey) {
  const out = [...list];
  const byName = (a: PropertyOverview, b: PropertyOverview) => a.name.localeCompare(b.name);
  if (sort === "name") return out.sort(byName);
  if (sort === "beds") return out.sort((a, b) => b.totalBeds - a.totalBeds || byName(a, b));
  if (sort === "occupancy-asc")
    return out.sort((a, b) => a.occupancyPct - b.occupancyPct || byName(a, b));
  return out.sort((a, b) => b.occupancyPct - a.occupancyPct || byName(a, b));
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  isLoading,
  aside,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  isLoading?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[104px] items-center gap-4 overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground tabular-nums">
            {value}
          </p>
        )}
      </div>
      {aside}
    </div>
  );
}

function PropertiesListPage() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const nav = useNavigate();
  const navSelf = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const statusFilter: StatusFilter = search.status ?? "ALL";
  const view: ViewMode = search.view ?? "grid";
  const sort: SortKey = search.sort ?? "occupancy-desc";
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);

  const overview = usePropertiesOverview(tenantId);
  const all = useMemo(() => overview.data?.properties ?? [], [overview.data]);
  const totals = overview.data?.totals;

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      ALL: all.length,
      ACTIVE: 0,
      DRAFT: 0,
      INACTIVE: 0,
      SUSPENDED: 0,
    };
    for (const p of all) if (p.status in c) c[p.status as StatusFilter] += 1;
    return c;
  }, [all]);

  const visible = useMemo(
    () =>
      sortProperties(
        statusFilter === "ALL" ? all : all.filter((p) => p.status === statusFilter),
        sort,
      ),
    [all, statusFilter, sort],
  );

  const setSearch = (patch: { status?: StatusFilter; view?: ViewMode; sort?: SortKey }) =>
    navSelf({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  // Students / Finance / Reports pages follow the sidebar's active property,
  // so switch to this one first, then open the page.
  const openFor = (id: string, action: PropertyQuickAction) => {
    setActivePropertyId(id);
    if (action === "students") nav({ to: "/admin/students" });
    else if (action === "finance") nav({ to: "/admin/finance" });
    else nav({ to: "/admin/reports" });
  };

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              Properties
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your hostels, PGs and residences from one place
            </p>
          </div>
        </div>
        <Button
          onClick={() => nav({ to: "/admin/properties/new" })}
          className="h-10 self-start rounded-xl sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Add property
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Building2}
          label="Total properties"
          value={String(totals?.properties ?? 0)}
          isLoading={overview.isLoading}
          aside={
            <img
              src={occupancyTower}
              alt=""
              aria-hidden="true"
              width={720}
              height={575}
              className="pointer-events-none absolute -bottom-3 right-3 hidden h-[84px] w-auto opacity-90 sm:block"
            />
          }
        />
        <SummaryCard
          icon={BedDouble}
          label="Total beds"
          value={(totals?.beds ?? 0).toLocaleString("en-IN")}
          isLoading={overview.isLoading}
        />
        <SummaryCard
          icon={Users}
          label="Total residents"
          value={(totals?.residents ?? 0).toLocaleString("en-IN")}
          isLoading={overview.isLoading}
        />
        <SummaryCard
          icon={Gauge}
          label="Overall occupancy"
          value={`${totals?.occupancyPct ?? 0}%`}
          isLoading={overview.isLoading}
          aside={
            overview.isLoading ? null : (
              <OccupancyRing
                percent={totals?.occupancyPct ?? 0}
                size={52}
                stroke={6}
                label={null}
                showValue={false}
              />
            )
          }
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-2 shadow-card-ambient lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex gap-1.5 overflow-x-auto p-0.5"
        >
          {STATUS_FILTERS.filter((s) => s !== "SUSPENDED" || counts.SUSPENDED > 0).map((s) => {
            const selected = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSearch({ status: s === "ALL" ? undefined : s })}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {STATUS_FILTER_LABEL[s]}
                <span className="tabular-nums text-xs opacity-80">({counts[s]})</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 p-0.5">
          <div className="flex rounded-lg border border-border/80 p-0.5" aria-label="Layout">
            {(
              [
                ["grid", LayoutGrid, "Grid view"],
                ["list", List, "List view"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={view === v}
                title={label}
                onClick={() => setSearch({ view: v === "grid" ? undefined : v })}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === v
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <Select
            value={sort}
            onValueChange={(v) =>
              setSearch({ sort: v === "occupancy-desc" ? undefined : (v as SortKey) })
            }
          >
            <SelectTrigger className="h-9 w-full min-w-[220px] text-sm lg:w-auto" aria-label="Sort">
              <span className="mr-1 text-muted-foreground">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {overview.isLoading ? (
        view === "grid" ? (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[420px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableSkeleton
                columns={7}
                rows={5}
                widths={["w-32", "w-24", "w-20", "w-16", "w-16", "w-12", "w-8"]}
              />
            </Table>
          </div>
        )
      ) : overview.isError ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-foreground">
          Couldn’t load your properties.{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => overview.refetch()}
          >
            Try again
          </button>
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to onboard students, add rooms and start collecting fees."
          action={{ label: "Add property", onClick: () => nav({ to: "/admin/properties/new" }) }}
        />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No {STATUS_FILTER_LABEL[statusFilter].toLowerCase()} properties.{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setSearch({ status: undefined })}
          >
            Show all
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              isCurrent={p.id === activePropertyId}
              onOpen={() => nav({ to: "/admin/properties/$slug", params: { slug: p.slug } })}
              onQuickAction={(a) => openFor(p.id, a)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card-ambient">
          <div className="overflow-x-auto">
            <Table className="min-w-160">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">Name</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">City</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">Status</TableHead>
                  <TableHead className="px-3 py-3 text-right sm:px-6 sm:py-4">Beds</TableHead>
                  <TableHead className="px-3 py-3 text-right sm:px-6 sm:py-4">Residents</TableHead>
                  <TableHead className="px-3 py-3 text-right sm:px-6 sm:py-4">Occupancy</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-3 py-3 font-medium sm:px-6 sm:py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10">
                          <Building2 className="h-4 w-4 text-primary" />
                        </span>
                        <Link
                          to="/admin/properties/$slug"
                          params={{ slug: p.slug }}
                          className="hover:text-primary"
                        >
                          {p.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 sm:px-6 sm:py-4">
                      {cleanPlace(p.city) ?? "—"}
                    </TableCell>
                    <TableCell className="px-3 py-3 sm:px-6 sm:py-4">
                      <PropertyStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums sm:px-6 sm:py-4">
                      {p.totalBeds}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums sm:px-6 sm:py-4">
                      {p.residents}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums sm:px-6 sm:py-4">
                      {p.occupancyPct}%
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      <PropertyActionsMenu property={p} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
