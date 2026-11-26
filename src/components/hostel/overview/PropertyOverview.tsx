import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, CalendarPlus, DoorOpen, House, Users } from "lucide-react";

import { DeltaPill } from "@/components/dashboard/admin/DashboardStatCard";
import {
  BlockwiseStudentsCard,
  StudentDistributionCard,
  StudentTrendCard,
} from "@/components/hostel/overview/OverviewCharts";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import { PropertyStudentsCard } from "@/components/hostel/overview/PropertyStudentsCard";
import { KpiTile, SharePill } from "@/components/hostel/overview/KpiTile";
import { QuickActionsCard } from "@/components/hostel/overview/QuickActionsCard";
import { Button } from "@/components/ui/button";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import { getPropertyStudentTrend, type StudentTrendRange } from "@/lib/property-overview.functions";

export interface OverviewProperty {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
}

/**
 * A property's Overview tab: header, section tabs, KPI tiles, the student
 * trend / block-wise / distribution charts, the students table and quick
 * actions. The route resolves the slug and hands the loaded property in.
 */
export function PropertyOverview({ property }: { property: OverviewProperty }) {
  const [range, setRange] = useState<StudentTrendRange>("30d");
  const trendFn = useServerFn(getPropertyStudentTrend);
  const statsQ = usePropertyOverviewStats(property.id);
  const trendQ = useQuery({
    queryKey: ["property-overview", property.id, "trend", range],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => trendFn({ data: { property_id: property.id, range } }),
  });

  const stats = statsQ.data;
  const isLoadingStats = statsQ.isLoading;
  const net = (stats?.newThisMonth ?? 0) - (stats?.movedOutThisMonth ?? 0);
  const realBlocks = (stats?.blockwise ?? []).filter((b) => b.id !== "none");
  const heroProperty = property;

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={heroProperty}
        blocks={stats?.blocksCount}
        beds={stats?.beds.total}
        residents={stats?.residents}
        isLoadingCounts={isLoadingStats}
      />
      <PropertyTabs slug={heroProperty.slug} />

      {statsQ.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            We couldn't load this property's numbers. Please try again.
          </span>
          <Button variant="outline" size="sm" onClick={() => statsQ.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-6 2xl:grid-cols-5">
        <KpiTile
          className="lg:col-span-2 2xl:col-span-1 2xl:last:col-span-1"
          icon={Users}
          label="Total students"
          value={stats?.residents ?? 0}
          isLoading={isLoadingStats}
          caption="Active residents"
          badge={
            <DeltaPill
              plain
              delta={{
                value: net,
                label: `${net > 0 ? "+" : ""}${net}`,
                description: "net change this month (joined minus moved out)",
              }}
            />
          }
        />
        <KpiTile
          className="lg:col-span-2 2xl:col-span-1 2xl:last:col-span-1"
          icon={House}
          label="Allotted"
          value={stats?.beds.occupied ?? 0}
          isLoading={isLoadingStats}
          caption="Occupied beds"
          badge={
            <SharePill
              value={stats?.beds.occupancyPct ?? 0}
              description="of usable beds occupied"
            />
          }
        />
        <KpiTile
          className="lg:col-span-2 2xl:col-span-1 2xl:last:col-span-1"
          icon={BedDouble}
          label="Vacant beds"
          value={stats?.beds.vacant ?? 0}
          isLoading={isLoadingStats}
          caption="Ready to allot"
          badge={
            <SharePill value={stats?.beds.vacantPct ?? 0} description="of usable beds vacant" />
          }
        />
        <KpiTile
          className="sm:last:col-span-2 lg:col-span-3 lg:last:col-span-3 2xl:col-span-1 2xl:last:col-span-1"
          icon={CalendarPlus}
          label="New this month"
          value={stats?.newThisMonth ?? 0}
          isLoading={isLoadingStats}
          caption="Residents added this month"
        />
        <KpiTile
          className="sm:last:col-span-2 lg:col-span-3 lg:last:col-span-3 2xl:col-span-1 2xl:last:col-span-1"
          icon={DoorOpen}
          label="Leaving this month"
          value={stats?.leavingThisMonth ?? 0}
          isLoading={isLoadingStats}
          caption="Notice given, leaving by month end"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:col-span-2 xl:col-span-1">
          <StudentTrendCard
            range={range}
            onRangeChange={setRange}
            points={trendQ.data}
            isLoading={trendQ.isLoading}
            isError={trendQ.isError}
          />
        </div>
        <BlockwiseStudentsCard
          rows={stats?.blockwise}
          isLoading={isLoadingStats}
          isError={statsQ.isError}
        />
        <StudentDistributionCard
          gender={stats?.gender}
          isLoading={isLoadingStats}
          isError={statsQ.isError}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PropertyStudentsCard
          propertyId={property.id}
          blocks={[
            ...realBlocks.map((b) => ({ id: b.id, name: b.name })),
            ...(realBlocks.length && stats?.blockwise.some((b) => b.id === "none")
              ? [{ id: "none", name: "No block" }]
              : []),
          ]}
        />
        <QuickActionsCard
          tenantId={property.tenant_id}
          property={{ id: property.id, slug: heroProperty.slug, status: heroProperty.status }}
        />
      </div>
    </div>
  );
}
