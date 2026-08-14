import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useAccountantProperty } from "@/lib/staff-scope";
import { AgingReportPanel, OccupancyReportPanel } from "@/components/reports/panels";

// Accountants get DSO/Aging + a revenue-relevant occupancy view.
// No SLA / bed-level operational detail per Phase 4 RLS scoping.
export const Route = createFileRoute("/_authenticated/accountant/reports")({
  component: AccountantReportsPage,
});

function AccountantReportsPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description="Collections and revenue-relevant occupancy." />
      <AgingReportPanel propertyId={propertyId} />
      <OccupancyReportPanel propertyId={propertyId} />
    </div>
  );
}
