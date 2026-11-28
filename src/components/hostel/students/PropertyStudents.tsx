import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Bell,
  ClipboardCheck,
  DoorOpen,
  Link2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import { KycApprovalsCard } from "@/components/hostel/students/KycApprovalsCard";
import { MoveOutNoticesCard } from "@/components/hostel/students/MoveOutNoticesCard";
import { RecentActivityStrip } from "@/components/hostel/students/RecentActivityStrip";
import { StudentFormDialog } from "@/components/hostel/students/StudentFormDialog";
import { StudentStatusCard } from "@/components/hostel/students/StudentStatusCard";
import { StudentsDirectoryCard } from "@/components/hostel/students/StudentsDirectoryCard";
import { StudentBulkImportModal } from "@/components/students/StudentBulkImportModal";
import { Button } from "@/components/ui/button";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import { invalidateStudentsTab, useStudentCounts } from "@/lib/property-students";
import { useStudentsRealtime } from "@/lib/student-realtime";

/**
 * A property's Students tab: admissions actions, lifecycle KPIs, the students
 * directory with row actions, status breakdown, pending KYC, move-out notices
 * and the latest student activity.
 */
export function PropertyStudents({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const countsQ = useStudentCounts(property.id);
  const statsQ = usePropertyOverviewStats(property.id);
  useStudentsRealtime(property.id);

  const counts = countsQ.data;
  // null renders as "—" in KpiTile: a failed count is never shown as 0.
  const kpi = (pick: (c: NonNullable<typeof counts>) => number) =>
    counts ? pick(counts) : countsQ.isError ? null : 0;
  const isPropertyActive = property.status.toUpperCase() === "ACTIVE";
  const refresh = () => invalidateStudentsTab(qc, property.id);

  const shareAdmissionLink = async () => {
    const url = `${window.location.origin}/apply/${property.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Admission link copied — share it with applicants via WhatsApp/SMS.");
    } catch {
      toast.error(`Couldn't copy automatically. The link is ${url}`);
    }
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Students
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage admissions, active students, KYC and move-outs
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-xl"
            onClick={shareAdmissionLink}
            disabled={!isPropertyActive}
            title={
              isPropertyActive
                ? "Copy the public admission form link"
                : "The admission form only works while the property is active"
            }
          >
            <Link2 className="h-4 w-4" aria-hidden="true" /> Share public form
          </Button>
          <Button variant="outline" className="h-9 rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Bulk import
          </Button>
          <Button className="h-9 rounded-xl" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add student
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiTile
          icon={Users}
          label="Total students"
          value={kpi((c) => c.total)}
          isLoading={countsQ.isLoading}
          caption="Every status, archived excluded"
        />
        <KpiTile
          icon={BedDouble}
          label="Active"
          value={kpi((c) => c.active)}
          isLoading={countsQ.isLoading}
          caption="Living here now"
        />
        <KpiTile
          icon={ClipboardCheck}
          label="Applicants"
          value={kpi((c) => c.applicant + c.verified)}
          isLoading={countsQ.isLoading}
          caption={
            counts ? `${counts.verified.toLocaleString("en-IN")} verified` : "Waiting to move in"
          }
        />
        <KpiTile
          icon={Bell}
          label="Notice given"
          value={kpi((c) => c.noticeGiven)}
          isLoading={countsQ.isLoading}
          caption="Leaving soon"
        />
        <KpiTile
          icon={DoorOpen}
          label="Moved out"
          value={kpi((c) => c.movedOut)}
          isLoading={countsQ.isLoading}
          caption="Past students"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <StudentsDirectoryCard
          tenantId={property.tenant_id}
          propertyId={property.id}
          counts={counts}
        />
        <div className="grid grid-cols-1 content-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-1">
          <StudentStatusCard
            counts={counts}
            isLoading={countsQ.isLoading}
            isError={countsQ.isError}
          />
          <KycApprovalsCard tenantId={property.tenant_id} propertyId={property.id} />
          <MoveOutNoticesCard tenantId={property.tenant_id} propertyId={property.id} />
        </div>
      </div>

      <RecentActivityStrip propertyId={property.id} />

      <StudentFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        tenantId={property.tenant_id}
        propertyId={property.id}
        onDone={refresh}
      />
      <StudentBulkImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        tenantId={property.tenant_id}
        propertyId={property.id}
        onDone={refresh}
      />
    </div>
  );
}
