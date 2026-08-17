import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  OccupancyReportPanel,
  SlaComplianceReportPanel,
  AttendanceReportPanel,
} from "@/components/reports/panels";

/**
 * Warden reports — SLA compliance for their assigned scope and
 * block/property occupancy. No finance data (Occupancy/SLA export stays
 * hidden — Warden has no export right on those rows of PRD §7's matrix).
 * Attendance export IS shown: PRD §7's "Reports & analytics" row grants
 * Warden "VX (assigned)" — View + Export scoped to their own assignment —
 * separately from the raw "Attendance" row (VCED, no X) that only governs
 * the daily bulk-mark screen.
 */
export const Route = createFileRoute("/_authenticated/warden/reports")({
  component: WardenReportsPage,
});

function WardenReportsPage() {
  // Resolve a property in the warden's scope via role_assignments (RLS-safe).
  const q = useQuery({
    queryKey: ["warden-scope-property"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;
      const { data } = await supabase
        .from("role_assignments")
        .select("property_id")
        .eq("user_id", user.user.id)
        .eq("role", "WARDEN")
        .eq("is_active", true)
        .not("property_id", "is", null)
        .limit(1)
        .maybeSingle();
      return data?.property_id ?? null;
    },
  });

  const propertyId = q.data;
  return (
    <div className="space-y-8 p-4">
      <PageHeader
        title="Reports"
        description="Your scope only. Attendance can be downloaded; occupancy and SLA are view-only."
      />
      {!propertyId ? (
        <p className="text-sm text-muted-foreground">
          No assigned property scope yet. Ask your admin to assign a block or property.
        </p>
      ) : (
        <>
          <SlaComplianceReportPanel propertyId={propertyId} showExport={false} />
          <OccupancyReportPanel propertyId={propertyId} showExport={false} />
          <AttendanceReportPanel propertyId={propertyId} />
        </>
      )}
    </div>
  );
}
