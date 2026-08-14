import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/utils";
import { listPlans, updatePlanTrialDays } from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/plans")({
  component: SuperPlansPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  price_paise: number;
  billing_interval: string;
  trial_days: number;
  is_active: boolean;
};

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function SuperPlansPage() {
  const listFn = useServerFn(listPlans);
  const { data: plans = [] } = useQuery({ queryKey: ["plans"], queryFn: () => listFn({}) });
  const [trialTarget, setTrialTarget] = useState<Plan | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description="Pricing tiers available to tenants, and each plan's configured trial period."
      />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Trial period</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(plans as Plan[]).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">
                  {p.price_paise > 0
                    ? `${formatInr(p.price_paise)} / ${p.billing_interval?.toLowerCase()}`
                    : "Custom"}
                </td>
                <td className="px-4 py-2">
                  {p.trial_days} day{p.trial_days === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setTrialTarget(p)}>
                    <Settings2 className="mr-1 h-3.5 w-3.5" />
                    Edit trial period
                  </Button>
                </td>
              </tr>
            ))}
            {!plans.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No plans yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditTrialDaysDialog plan={trialTarget} onClose={() => setTrialTarget(null)} />
    </div>
  );
}

function EditTrialDaysDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePlanTrialDays);

  const [trialDaysInput, setTrialDaysInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openId = plan?.id ?? null;
  const [lastOpenId, setLastOpenId] = useState<string | null>(null);
  if (openId && openId !== lastOpenId) {
    setLastOpenId(openId);
    setTrialDaysInput(String(plan?.trial_days ?? 7));
    setError(null);
  }

  const save = useMutation({
    mutationFn: () => {
      if (!plan) throw new Error("No plan selected");
      const days = Number(trialDaysInput);
      if (!Number.isInteger(days) || days < 0) {
        throw new Error("Enter a whole number of days, 0 or more");
      }
      return updateFn({ data: { plan_id: plan.id, trial_days: days } });
    },
    onSuccess: () => {
      toast.success("Trial period updated");
      qc.invalidateQueries({ queryKey: ["plans"] });
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e, "Could not update trial period")),
  });

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit trial period</DialogTitle>
          <DialogDescription>
            {plan
              ? `How many days of TRIAL access a new ${plan.name} subscription gets. Default is 7 days when unset.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="trial-days-input">Trial days</Label>
          <Input
            id="trial-days-input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={trialDaysInput}
            onChange={(e) => setTrialDaysInput(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
