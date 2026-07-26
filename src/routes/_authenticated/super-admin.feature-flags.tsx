import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  listAllTenants,
  listTenantFeatures,
  upsertFeatureOverride,
  deleteFeatureOverride,
} from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/feature-flags")({
  component: FeatureFlagsPage,
});

function FeatureFlagsPage() {
  const listTenantsFn = useServerFn(listAllTenants);
  const listFeatsFn = useServerFn(listTenantFeatures);
  const upsertFn = useServerFn(upsertFeatureOverride);
  const deleteFn = useServerFn(deleteFeatureOverride);
  const qc = useQueryClient();

  const { data: tenants = [] } = useQuery({ queryKey: ["all-tenants"], queryFn: () => listTenantsFn({}) });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newReason, setNewReason] = useState("");

  const { data: feats } = useQuery({
    queryKey: ["tenant-features", tenantId],
    queryFn: () => listFeatsFn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
  });

  const toggle = useMutation({
    mutationFn: (v: { feature_key: string; enabled: boolean; reason: string }) =>
      upsertFn({ data: { tenant_id: tenantId!, ...v } }),
    onSuccess: () => {
      toast.success("Override saved");
      qc.invalidateQueries({ queryKey: ["tenant-features", tenantId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const removeOverride = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Override removed");
      qc.invalidateQueries({ queryKey: ["tenant-features", tenantId] });
    },
  });

  // Build combined view: union of plan feature keys + override keys.
  const planMap = new Map<string, any>((feats?.planFeatures ?? []).map((f: any) => [f.feature_key, f]));
  const overrideMap = new Map<string, any>((feats?.overrides ?? []).map((f: any) => [f.feature_key, f]));
  const allKeys = Array.from(new Set([...planMap.keys(), ...overrideMap.keys()]));

  return (
    <div className="space-y-6">
      <PageHeader title="Feature flags" description="Per-tenant entitlement overrides on top of plan defaults." />

      <div className="flex flex-wrap gap-2">
        {tenants.map((t: any) => (
          <Button
            key={t.id}
            size="sm"
            variant={t.id === tenantId ? "default" : "outline"}
            onClick={() => setTenantId(t.id)}
          >
            {t.display_name}
          </Button>
        ))}
      </div>

      {tenantId && (
        <>
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold">Add / change override</h2>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1"><Label>Feature key</Label><Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. gate_qr_scanner" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Reason (required)</Label><Input value={newReason} onChange={(e) => setNewReason(e.target.value)} /></div>
              <div className="flex items-end gap-2">
                <Button
                  disabled={!newKey || newReason.length < 3}
                  onClick={() => toggle.mutate({ feature_key: newKey, enabled: true, reason: newReason })}
                >
                  <Check className="h-4 w-4" /> Enable
                </Button>
                <Button
                  variant="destructive"
                  disabled={!newKey || newReason.length < 3}
                  onClick={() => toggle.mutate({ feature_key: newKey, enabled: false, reason: newReason })}
                >
                  <X className="h-4 w-4" /> Disable
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Feature</th>
                  <th className="px-4 py-2">Plan default</th>
                  <th className="px-4 py-2">Override</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allKeys.map((key) => {
                  const plan = planMap.get(key);
                  const ovr = overrideMap.get(key);
                  const effective = ovr ? ovr.enabled : plan?.enabled ?? false;
                  return (
                    <tr key={key} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{key}</td>
                      <td className="px-4 py-2">{plan ? (plan.enabled ? "on" : "off") : "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={effective}
                            onCheckedChange={(v) => {
                              const reason = window.prompt("Reason for override?") ?? "";
                              if (reason.length < 3) return;
                              toggle.mutate({ feature_key: key, enabled: v, reason });
                            }}
                          />
                          {ovr && <Badge variant="secondary">override</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{ovr?.reason ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        {ovr && (
                          <Button size="sm" variant="ghost" onClick={() => removeOverride.mutate(ovr.id)}>
                            <Trash2 className="h-4 w-4" /> Remove override
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!allKeys.length && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No features defined yet for this tenant's plan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
