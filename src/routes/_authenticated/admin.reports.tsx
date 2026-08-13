import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { usePropertyStore } from "@/stores/property-store";
import {
  OccupancyReportPanel,
  AgingReportPanel,
  SlaComplianceReportPanel,
  AttendanceReportPanel,
} from "@/components/reports/panels";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReportsPage,
});

function AdminReportsPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Cross-cutting analytics across occupancy, finance and complaints."
      />
      <OccupancyReportPanel propertyId={propertyId} />
      <AgingReportPanel propertyId={propertyId} />
      <SlaComplianceReportPanel propertyId={propertyId} />
      <AttendanceReportPanel propertyId={propertyId} />
    </div>
  );
}
