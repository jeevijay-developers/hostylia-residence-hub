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
 * block/property occupancy. No finance data. Export is intentionally
 * hidden per PRD §7 RBAC matrix (Warden has no export capability).
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
        description="Your scope only. Export is not available for Wardens."
      />
      {!propertyId ? (
        <p className="text-sm text-muted-foreground">
          No assigned property scope yet. Ask your admin to assign a block or property.
        </p>
      ) : (
        <>
          <SlaComplianceReportPanel propertyId={propertyId} showExport={false} />
          <OccupancyReportPanel propertyId={propertyId} showExport={false} />
          <AttendanceReportPanel propertyId={propertyId} showExport={false} />
        </>
      )}
    </div>
  );
}
