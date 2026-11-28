import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BedDouble,
  Bell,
  CalendarCheck,
  CircleAlert,
  IndianRupee,
  UserPlus,
  Users,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { AdminDashboardHeader } from "@/components/dashboard/admin/AdminDashboardHeader";
import { AttentionCard, type AttentionItem } from "@/components/dashboard/admin/AttentionCard";
import { CollectionsTrendCard } from "@/components/dashboard/admin/CollectionsTrendCard";
import {
  DashboardStatCard,
  StatProgress,
  StatSparkline,
} from "@/components/dashboard/admin/DashboardStatCard";
import { OccupancyTowerCard } from "@/components/dashboard/admin/OccupancyTowerCard";
import { PlanExpiryBanner } from "@/components/dashboard/admin/PlanExpiryBanner";
import { RecentActivityCard } from "@/components/dashboard/admin/RecentActivityCard";
import { KycApprovalQueueCard } from "@/components/students/KycApprovalQueue";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { formatInr, formatInrCompact } from "@/lib/finance";
import { useAdminRecentActivity } from "@/lib/admin-activity";
import {
  useAdminKpis,
  useAttendanceToday,
  useCollectionsSummary,
  useDashboardProperty,
  useMoveOutNoticeCount,
  usePendingKycCount,
  usePlanExpiry,
  type CollectionsRange,
} from "@/lib/admin-dashboard";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboardPage,
});

const KYC_SECTION_ID = "kyc-approvals";

function signed(n: number, unit = "") {
  return `${n > 0 ? "+" : ""}${n}${unit}`;
}

function AdminDashboardPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const navigate = useNavigate();
  const [collectionsRange, setCollectionsRange] = useState<CollectionsRange>("this-month");

  // Whether this tenant has any property at all — distinct from "no property
  // selected yet" (PropertySwitcher auto-selects the first one once loaded).
  const propertiesQ = useQuery({
    queryKey: ["admin-dashboard-property-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count, error } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const hasNoProperties = propertiesQ.data === 0;

  const propertyQ = useDashboardProperty(propertyId);
  const property = propertyQ.data;
  const kpis = useAdminKpis(propertyId);
  // The KPI tile always shows month-to-date; the chart card has its own range.
  const collectionsMtd = useCollectionsSummary(propertyId, "this-month");
  const collectionsChart = useCollectionsSummary(propertyId, collectionsRange);
  const attendance = useAttendanceToday(propertyId, property?.timezone);
  const pendingKyc = usePendingKycCount();
  const moveOutNotices = useMoveOutNoticeCount(tenantId, propertyId);
  const planExpiry = usePlanExpiry(tenantId);
  const { items: recentActivity, isLoading: activityLoading } = useAdminRecentActivity(
    tenantId,
    propertyId,
  );

  const k = kpis.data;
  const mtd = collectionsMtd.data;
  const att = attendance.data;

  const attentionItems: AttentionItem[] = [
    {
      key: "complaints",
      icon: CircleAlert,
      label: "Complaints",
      count: k?.openComplaints,
      isLoading: kpis.isLoading,
      tone: "destructive",
      actionLabel: "View open complaints",
      onSelect: () => navigate({ to: "/admin/complaints", search: { status: "OPEN" } }),
    },
    {
      key: "approvals",
      icon: UserPlus,
      label: "Approvals",
      count: pendingKyc.data,
      isLoading: pendingKyc.isLoading,
      tone: "warning",
      actionLabel: "Review pending KYC documents",
      onSelect: () =>
        document
          .getElementById(KYC_SECTION_ID)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
    {
      key: "move-out",
      icon: Bell,
      label: "Move-out notices",
      count: moveOutNotices.data,
      isLoading: moveOutNotices.isLoading,
      tone: "info",
      actionLabel: "Review move-out notices on the Students page",
      onSelect: () => navigate({ to: "/admin/students" }),
    },
  ];

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      {planExpiry.data ? <PlanExpiryBanner expiry={planExpiry.data} /> : null}

      <AdminDashboardHeader
        propertyName={property?.name}
        propertyLocation={
          property ? [property.city, property.state].filter(Boolean).join(", ") : null
        }
        timeZone={property?.timezone}
        isLoading={!!propertyId && propertyQ.isLoading}
      />

      {!propertyId ? (
        <p className="text-sm text-muted-foreground">
          {hasNoProperties
            ? "Add a property to see live metrics."
            : "Select a property to see live metrics."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            icon={BedDouble}
            label="Occupancy"
            value={`${k?.occupancyPct ?? 0}%`}
            isLoading={kpis.isLoading}
            caption={
              k ? `${k.occupiedBeds} of ${k.occupiedBeds + k.vacantBeds} beds occupied` : undefined
            }
            footer={<StatProgress percent={k?.occupancyPct ?? 0} label="Bed occupancy" />}
            onNavigate={() => navigate({ to: "/admin/properties" })}
          />
          <DashboardStatCard
            icon={Users}
            label="Residents"
            value={k?.activeStudents ?? 0}
            isLoading={kpis.isLoading}
            delta={
              k
                ? {
                    value: k.newStudentsThisMonth,
                    label: signed(k.newStudentsThisMonth),
                    description: "new active residents this month",
                  }
                : null
            }
            caption="Active students"
            onNavigate={() => navigate({ to: "/admin/students", search: { status: "ACTIVE" } })}
          />
          <DashboardStatCard
            icon={IndianRupee}
            label="Collections (MTD)"
            value={formatInrCompact(mtd?.totalPaise ?? 0)}
            valueTitle={formatInr(mtd?.totalPaise ?? 0)}
            isLoading={collectionsMtd.isLoading}
            delta={
              mtd?.deltaPct != null
                ? {
                    value: mtd.deltaPct,
                    label: signed(mtd.deltaPct, "%"),
                    description: "vs the same days last month",
                  }
                : mtd && mtd.totalPaise === 0
                  ? { value: 0, label: "0%", description: "no payments this month or last" }
                  : null
            }
            footer={
              <StatSparkline
                id="collections-mtd"
                values={(mtd?.points ?? []).map((p) => p.cumulativePaise)}
              />
            }
            onNavigate={() => navigate({ to: "/admin/finance/pnl" })}
          />
          <DashboardStatCard
            icon={CalendarCheck}
            label="Attendance"
            value={`${att?.pct ?? 0}%`}
            isLoading={attendance.isLoading}
            delta={
              att?.deltaPp != null
                ? {
                    value: att.deltaPp,
                    label: signed(att.deltaPp, " pp"),
                    description: "vs yesterday",
                  }
                : null
            }
            caption={att?.pct != null ? "Today, present + late" : "Not marked yet today"}
            onNavigate={() => navigate({ to: "/admin/attendance" })}
          />
        </div>
      )}

      {hasNoProperties && (
        <EmptyState
          title="Add your first property"
          description="Set up a property to start onboarding students, tracking fees and gate activity."
          action={{
            label: "Add property",
            onClick: () => navigate({ to: "/admin/properties" }),
          }}
        />
      )}

      {propertyId && (
        <>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <OccupancyTowerCard
              totalBeds={k?.totalBeds ?? 0}
              occupiedBeds={k?.occupiedBeds ?? 0}
              vacantBeds={k?.vacantBeds ?? 0}
              occupancyPct={k?.occupancyPct ?? 0}
              isLoading={kpis.isLoading}
              onManage={() => navigate({ to: "/admin/properties" })}
            />
            <CollectionsTrendCard
              range={collectionsRange}
              onRangeChange={setCollectionsRange}
              data={collectionsChart.data}
              isLoading={collectionsChart.isLoading}
              isError={collectionsChart.isError}
            />
          </div>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <AttentionCard items={attentionItems} />
            <RecentActivityCard items={recentActivity} isLoading={activityLoading} />
          </div>

          <section id={KYC_SECTION_ID} className="scroll-mt-24">
            <KycApprovalQueueCard />
          </section>
        </>
      )}
    </div>
  );
}
