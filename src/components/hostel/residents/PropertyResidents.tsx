import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BedDouble,
  Bell,
  ClipboardCheck,
  DoorOpen,
  LogOut,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  ActivityTimelineCard,
  type TimelineItem,
} from "@/components/dashboard/ActivityTimelineCard";
import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import {
  GenderOccupancyCard,
  MoveOutNoticesCard,
  ResidentInsightsCard,
} from "@/components/hostel/residents/ResidentInsightCards";
import { ResidentsDirectoryCard } from "@/components/hostel/residents/ResidentsDirectoryCard";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import {
  useMoveOutNotices,
  useResidentActivity,
  useResidentCounts,
  type ResidentEventKind,
} from "@/lib/property-residents";

const EVENT: Record<ResidentEventKind, { icon: LucideIcon; label: string }> = {
  ADDED: { icon: UserPlus, label: "Resident added" },
  ALLOTTED: { icon: BedDouble, label: "Bed allotted" },
  KYC: { icon: ShieldCheck, label: "KYC approved" },
  NOTICE: { icon: Bell, label: "Move-out notice submitted" },
  MOVED_OUT: { icon: DoorOpen, label: "Moved out" },
};

/**
 * A property's Residents tab: resident KPIs, the residents directory, status
 * insights, upcoming move-outs, gender split and recent resident activity.
 */
export function PropertyResidents({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const countsQ = useResidentCounts(property.id);
  const statsQ = usePropertyOverviewStats(property.id);
  const noticesQ = useMoveOutNotices(property.id);
  const activityQ = useResidentActivity(property.id);
  const counts = countsQ.data;

  const timeline = useMemo<TimelineItem[]>(
    () =>
      (activityQ.data ?? []).map((e) => ({
        key: e.key,
        at: e.at,
        icon: EVENT[e.kind].icon,
        text: (
          <>
            <span className="font-medium">{EVENT[e.kind].label}</span>
            <span className="text-muted-foreground">
              {" "}
              – {e.name}
              {e.detail ? ` (${e.detail})` : ""}
            </span>
          </>
        ),
      })),
    [activityQ.data],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-residents", property.id] });
    qc.invalidateQueries({ queryKey: ["property-overview", property.id] });
    qc.invalidateQueries({ queryKey: ["students-list"] });
  };

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          icon={Users}
          label="Total residents"
          value={counts?.total ?? 0}
          isLoading={countsQ.isLoading}
          caption="Every status"
        />
        <KpiTile
          icon={BedDouble}
          label="Active residents"
          value={counts?.active ?? 0}
          isLoading={countsQ.isLoading}
          caption="Living here now"
        />
        <KpiTile
          icon={ClipboardCheck}
          label="Applicants"
          value={counts?.applicants ?? 0}
          isLoading={countsQ.isLoading}
          caption="Waiting to move in"
        />
        <KpiTile
          icon={LogOut}
          label="Move-outs due"
          value={statsQ.data?.leavingThisMonth ?? 0}
          isLoading={statsQ.isLoading}
          caption="Notice given, leaving by month end"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <ResidentsDirectoryCard
          propertyId={property.id}
          counts={counts}
          onAddResident={() => setAddOpen(true)}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:flex 2xl:flex-col">
          <ResidentInsightsCard counts={counts} isLoading={countsQ.isLoading} />
          <MoveOutNoticesCard
            notices={noticesQ.data?.items ?? []}
            total={noticesQ.data?.total ?? 0}
            isLoading={noticesQ.isLoading}
            isError={noticesQ.isError}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <GenderOccupancyCard gender={statsQ.data?.gender} isLoading={statsQ.isLoading} />
        <ActivityTimelineCard
          title="Recent resident activity"
          icon={Activity}
          items={timeline}
          isLoading={activityQ.isLoading}
          isError={activityQ.isError}
          errorText="Couldn’t load resident activity. Please refresh to try again."
          emptyText="No resident activity yet."
        />
      </div>

      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tenantId={property.tenant_id}
        propertyId={property.id}
        onDone={refresh}
      />
    </div>
  );
}
