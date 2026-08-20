import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Wallet, MessageSquareWarning } from "lucide-react";

import { KpiSummaryCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityIcon } from "@/components/warden/ActivityIcon";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { formatInr } from "@/lib/finance";
import { useAdminRecentActivity } from "@/lib/admin-activity";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboardPage,
});

// Same "open" set fn_scan_complaint_sla_breaches uses (everything except
// RESOLVED/CLOSED/CANCELLED).
const OPEN_COMPLAINT_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_STUDENT",
  "REOPENED",
];

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

function AdminDashboardPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const navigate = useNavigate();

  // Whether this tenant has any property at all — distinct from "no property
  // selected yet" (PropertySwitcher auto-selects the first one once loaded).
  const propertiesQ = useQuery({
    queryKey: ["admin-dashboard-property-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const kpis = useQuery({
    queryKey: ["admin-kpis", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { start, end } = currentMonthRange();
      const [bedsRes, paymentsRes, complaintsRes, studentsRes] = await Promise.all([
        supabase
          .from("beds")
          .select("status")
          .eq("property_id", propertyId!)
          .is("deleted_at", null),
        supabase
          .from("payments")
          .select("amount_paise")
          .eq("property_id", propertyId!)
          .eq("status", "CAPTURED")
          .gte("paid_at", start)
          .lt("paid_at", end),
        supabase
          .from("complaints")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId!)
          .is("deleted_at", null)
          .in("status", OPEN_COMPLAINT_STATUSES),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId!)
          .is("deleted_at", null)
          .eq("status", "ACTIVE"),
      ]);
      if (bedsRes.error) throw new Error(bedsRes.error.message);
      if (paymentsRes.error) throw new Error(paymentsRes.error.message);
      if (complaintsRes.error) throw new Error(complaintsRes.error.message);
      if (studentsRes.error) throw new Error(studentsRes.error.message);

      const beds = bedsRes.data ?? [];
      // Matches v_occupancy_summary's own formula: occupied / (occupied + vacant),
      // excluding MAINTENANCE/BLOCKED beds from the denominator.
      const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
      const occupiable = beds.filter(
        (b) => b.status === "OCCUPIED" || b.status === "VACANT",
      ).length;
      const occupancyPct = occupiable > 0 ? Math.round((occupied / occupiable) * 100) : 0;

      const collectionsPaise = (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount_paise, 0);

      return {
        occupancyPct,
        collectionsPaise,
        openComplaints: complaintsRes.count ?? 0,
        activeStudents: studentsRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const hasNoProperties = propertiesQ.data === 0;
  const { items: recentActivity, isLoading: activityLoading } = useAdminRecentActivity(
    tenantId,
    propertyId,
  );

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader title="Dashboard" description="Live snapshot of this property" />
      {!propertyId ? (
        <p className="text-sm text-muted-foreground">
          {hasNoProperties
            ? "Add a property to see live metrics."
            : "Select a property to see live metrics."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiSummaryCard
            icon={Building2}
            label="Occupancy"
            value={`${kpis.data?.occupancyPct ?? 0}%`}
            progressPercent={kpis.data?.occupancyPct ?? 0}
            loading={kpis.isLoading}
            tone="warning"
            onNavigate={() => navigate({ to: "/admin/properties" })}
          />
          <KpiSummaryCard
            icon={Wallet}
            label="Collections this month"
            value={formatInr(kpis.data?.collectionsPaise ?? 0)}
            loading={kpis.isLoading}
            tone="info"
            onNavigate={() => navigate({ to: "/admin/finance" })}
          />
          <KpiSummaryCard
            icon={MessageSquareWarning}
            label="Open complaints"
            value={kpis.data?.openComplaints ?? 0}
            loading={kpis.isLoading}
            tone="destructive"
            onNavigate={() => navigate({ to: "/admin/complaints" })}
          />
          <KpiSummaryCard
            icon={Users}
            label="Active students"
            value={kpis.data?.activeStudents ?? 0}
            loading={kpis.isLoading}
            tone="success"
            onNavigate={() => navigate({ to: "/admin/students" })}
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity yet.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {recentActivity.slice(0, 8).map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ActivityIcon type={item.type} />
                    <div className="min-w-0">
                      <div className="font-medium">{item.type}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(item.at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
