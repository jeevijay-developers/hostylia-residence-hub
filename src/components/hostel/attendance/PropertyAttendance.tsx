import { useState } from "react";
import { CalendarDays, Clock, UserCheck, UserX } from "lucide-react";

import {
  AttendanceStatusCard,
  AttendanceTrendCard,
} from "@/components/hostel/attendance/AttendanceCharts";
import { AttendanceQuickActions } from "@/components/hostel/attendance/AttendanceQuickActions";
import { TodayAttendanceCard } from "@/components/hostel/attendance/TodayAttendanceCard";
import { TodayAttendanceTile } from "@/components/hostel/attendance/TodayAttendanceTile";
import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import {
  usePropertyAttendanceToday,
  useAttendanceTrend,
  type TrendRange,
} from "@/lib/property-attendance";
import { usePropertyOverviewStats } from "@/lib/property-overview";

/**
 * A property's Attendance tab: today's attendance KPIs, the daily attendance
 * trend, today's status split, shortcuts into the attendance flows and
 * today's roster. Definitions live in src/lib/property-attendance.functions.ts.
 */
export function PropertyAttendance({ property }: { property: OverviewProperty }) {
  const [range, setRange] = useState<TrendRange>(7);
  const statsQ = usePropertyOverviewStats(property.id);
  const todayQ = usePropertyAttendanceToday(property.id);
  const trendQ = useAttendanceTrend(property.id, range);
  const today = todayQ.data;
  const counts = today?.counts;

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={property}
        blocks={statsQ.data?.blocksCount}
        beds={statsQ.data?.beds.total}
        residents={statsQ.data?.residents}
        isLoadingCounts={statsQ.isLoading}
      />
      <PropertyTabs slug={property.slug} />

      {/* Four status tiles per row from xl; the wide attendance tile joins them on
          one row only once each tile has room for its caption. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 min-[1800px]:grid-cols-6">
        <TodayAttendanceTile
          className={
            todayQ.isError
              ? "sm:col-span-2 xl:col-span-4 min-[1800px]:col-span-6"
              : "sm:col-span-2 xl:col-span-4 min-[1800px]:col-span-2"
          }
          today={today}
          isLoading={todayQ.isLoading}
          isError={todayQ.isError}
          onRetry={() => todayQ.refetch()}
        />
        {/* Without today's counts the status tiles have no number to show: the
            attendance tile above carries the error and the retry. */}
        {todayQ.isError ? null : (
          <>
            <KpiTile
              icon={UserCheck}
              label="Present"
              value={counts?.PRESENT ?? 0}
              isLoading={!counts}
              caption="Marked present today"
            />
            <KpiTile
              icon={UserX}
              label="Absent"
              value={counts?.ABSENT ?? 0}
              isLoading={!counts}
              caption="Marked absent today"
            />
            <KpiTile
              icon={Clock}
              label="Late in"
              value={counts?.LATE ?? 0}
              isLoading={!counts}
              caption="Marked late today"
            />
            <KpiTile
              icon={CalendarDays}
              label="On leave"
              value={counts?.ON_LEAVE ?? 0}
              isLoading={!counts}
              caption="Approved leave today"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <AttendanceTrendCard
          range={range}
          onRangeChange={setRange}
          points={trendQ.data}
          isLoading={trendQ.isLoading}
          isRefreshing={trendQ.isPlaceholderData}
          isError={trendQ.isError}
          onRetry={() => trendQ.refetch()}
        />
        <AttendanceStatusCard
          today={today}
          isLoading={todayQ.isLoading}
          isError={todayQ.isError}
          onRetry={() => todayQ.refetch()}
        />
        <div className="xl:col-span-2 2xl:col-span-1">
          <AttendanceQuickActions propertyId={property.id} propertySlug={property.slug} />
        </div>
      </div>

      <TodayAttendanceCard propertyId={property.id} date={today?.date} />
    </div>
  );
}
