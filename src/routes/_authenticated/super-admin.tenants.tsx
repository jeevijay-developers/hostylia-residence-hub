import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Loader2, PauseCircle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAllTenants,
  setTenantStatus,
  listPlans,
  listCurrentSubscriptionsByTenant,
  assignTenantSubscription,
} from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/tenants")({
  component: SuperTenantsPage,
});

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function SuperTenantsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllTenants);
  const setStatusFn = useServerFn(setTenantStatus);
  const { data: tenants = [] } = useQuery({ queryKey: ["all-tenants"], queryFn: () => listFn({}) });

  const [subscriptionTarget, setSubscriptionTarget] = useState<{ id: string; name: string } | null>(null);

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
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
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
                <td className="px-4 py-2 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSubscriptionTarget({ id: t.id, name: t.display_name })}
                  >
                    <CreditCard className="mr-1 h-3.5 w-3.5" />
                    Subscription
                  </Button>
                  {t.status === "ACTIVE" ? (
                    <Button size="sm" variant="destructive" onClick={() => flip.mutate({ tenant_id: t.id, status: "SUSPENDED" })}>
                      <PauseCircle className="h-3.5 w-3.5" /> Suspend
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => flip.mutate({ tenant_id: t.id, status: "ACTIVE" })}>
                      <Check className="h-3.5 w-3.5" /> Reactivate
                    </Button>
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

      <AssignSubscriptionDialog
        tenant={subscriptionTarget}
        onClose={() => setSubscriptionTarget(null)}
      />
    </div>
  );
}

function AssignSubscriptionDialog({
  tenant,
  onClose,
}: {
  tenant: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listPlansFn = useServerFn(listPlans);
  const listCurrentFn = useServerFn(listCurrentSubscriptionsByTenant);
  const assignFn = useServerFn(assignTenantSubscription);

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => listPlansFn({}),
    enabled: !!tenant,
  });
  const { data: currentByTenant = {} } = useQuery({
    queryKey: ["current-subscriptions"],
    queryFn: () => listCurrentFn({}),
    enabled: !!tenant,
  });

  const current = tenant ? (currentByTenant as any)[tenant.id] : null;

  const [planId, setPlanId] = useState<string>("");
  const [status, setStatus] = useState<"TRIAL" | "ACTIVE">("ACTIVE");

  // Reset local selection whenever a new tenant is opened.
  const openTenantId = tenant?.id ?? null;
  const [lastOpenId, setLastOpenId] = useState<string | null>(null);
  if (openTenantId && openTenantId !== lastOpenId) {
    setLastOpenId(openTenantId);
    setPlanId(current?.plan_id ?? "");
    setStatus((current?.status as "TRIAL" | "ACTIVE") ?? "ACTIVE");
  }

  const assign = useMutation({
    mutationFn: () => {
      if (!tenant || !planId) throw new Error("Pick a plan first");
      return assignFn({ data: { tenant_id: tenant.id, plan_id: planId, status } });
    },
    onSuccess: () => {
      toast.success(`Subscription assigned to ${tenant?.name}`);
      qc.invalidateQueries({ queryKey: ["current-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["all-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-metrics"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to assign subscription"),
  });

  return (
    <Dialog open={!!tenant} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign subscription</DialogTitle>
          <DialogDescription>
            {tenant
              ? `Manually set ${tenant.name}'s plan — for hostels onboarded without self-serve checkout.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="plan-select">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="plan-select">
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.price_paise > 0 ? `${formatInr(p.price_paise)}/${p.billing_interval?.toLowerCase()}` : "Custom"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-select">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "TRIAL" | "ACTIVE")}>
              <SelectTrigger id="status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="TRIAL">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {current ? (
            <p className="text-xs text-muted-foreground">
              Current: {plans.find((p: any) => p.id === current.plan_id)?.name ?? "—"} ({current.status})
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No active subscription yet.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!planId || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {assign.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
