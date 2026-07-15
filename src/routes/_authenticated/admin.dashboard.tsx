import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Wallet, MessageSquareWarning } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;

  const kpis = useQuery({
    queryKey: ["admin-kpis", tenantId],
    queryFn: async () => {
      if (!tenantId) return { occupancy: 0, collections: 0, complaints: 0, students: 0 };
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      return { occupancy: 0, collections: 0, complaints: 0, students: 0, propertyCount: count ?? 0 };
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="A quick pulse of your hostels — occupancy, collections and open issues."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Building2} label="Occupancy" value="0%" loading={kpis.isLoading} />
        <KpiCard icon={Wallet} label="Collections this month" value="—" loading={kpis.isLoading} />
        <KpiCard icon={MessageSquareWarning} label="Open complaints" value={0} loading={kpis.isLoading} />
        <KpiCard icon={Users} label="Active students" value={0} loading={kpis.isLoading} />
      </div>

      <EmptyState
        title="Add your first property"
        description="Set up a property to start onboarding students, tracking fees and gate activity."
        action={{ label: "Add property" }}
      />
    </div>
  );
}
