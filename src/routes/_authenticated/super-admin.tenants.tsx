import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAllTenants, setTenantStatus } from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/tenants")({
  component: SuperTenantsPage,
});

function SuperTenantsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllTenants);
  const setStatusFn = useServerFn(setTenantStatus);
  const { data: tenants = [] } = useQuery({ queryKey: ["all-tenants"], queryFn: () => listFn({}) });

  const flip = useMutation({
    mutationFn: (v: { tenant_id: string; status: "ACTIVE" | "SUSPENDED" }) => setStatusFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["all-tenants"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Tenants" description="All hostels on the platform." />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Onboarding</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t: any) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{t.display_name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.slug}</td>
                <td className="px-4 py-2">
                  <Badge variant={t.status === "ACTIVE" ? "default" : "destructive"}>{t.status}</Badge>
                </td>
                <td className="px-4 py-2">{t.onboarding_status}</td>
                <td className="px-4 py-2 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  {t.status === "ACTIVE" ? (
                    <Button size="sm" variant="destructive" onClick={() => flip.mutate({ tenant_id: t.id, status: "SUSPENDED" })}>Suspend</Button>
                  ) : (
                    <Button size="sm" onClick={() => flip.mutate({ tenant_id: t.id, status: "ACTIVE" })}>Reactivate</Button>
                  )}
                </td>
              </tr>
            ))}
            {!tenants.length && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No tenants yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
