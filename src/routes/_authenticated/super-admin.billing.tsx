import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  Loader2,
  Settings2,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
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
import { Switch } from "@/components/ui/switch";
import { ChurnDetailsDialog } from "@/components/dashboard/ChurnDetailsDialog";
import { cn, getErrorMessage, toneClasses } from "@/lib/utils";
import {
  getPlatformMetrics,
  listSubscriptionsWithPlan,
  setTenantCustomPrice,
  type SubscriptionWithPlan,
} from "@/lib/super-admin.functions";
import {
  daysRemaining,
  formatRemaining,
  getExpiryIndicator,
  relevantEndDate,
} from "@/lib/subscription-expiry";

export const Route = createFileRoute("/_authenticated/super-admin/billing")({
  component: SuperBillingPage,
});

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

type SubscriptionRow = SubscriptionWithPlan;

const EXPIRY_INDICATOR: Record<
  NonNullable<ReturnType<typeof getExpiryIndicator>>,
  { label: string; icon: typeof Clock; tone: "warning" | "destructive" }
> = {
  ENDING_SOON: { label: "Ending soon", icon: Clock, tone: "warning" },
  ENDS_TODAY: { label: "Ends today", icon: AlertTriangle, tone: "destructive" },
  ENDED: { label: "Ended", icon: XCircle, tone: "destructive" },
};

function effectivePricePaise(s: SubscriptionRow): number {
  return s.custom_price_paise ?? s.plans?.price_paise ?? 0;
}

function formatPrice(s: SubscriptionRow): string {
  if (!s.plans) return "—";
  if (s.plans.billing_interval?.toUpperCase() === "CUSTOM" && s.custom_price_paise == null) {
    return "Custom";
  }
  return `${formatInr(effectivePricePaise(s))} / ${s.plans.billing_interval?.toLowerCase()}`;
}

function SuperBillingPage() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const subsFn = useServerFn(listSubscriptionsWithPlan);
  const { data: metrics } = useQuery({
    queryKey: ["platform-metrics"],
    queryFn: () => metricsFn({}),
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["all-subscriptions"],
    queryFn: () => subsFn({}),
  });
  const [manageTarget, setManageTarget] = useState<SubscriptionRow | null>(null);
  const [churnDetailsOpen, setChurnDetailsOpen] = useState(false);

  const chartData = Object.entries(metrics?.tenants_by_status ?? {}).map(([k, v]) => ({
    status: k,
    count: v,
  }));
  const churnedCount = metrics?.churned_count_30d ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Revenue"
        description="MRR, churn, and active subscriptions across all tenants."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={TrendingUp}
          label="MRR"
          value={metrics ? formatInr(metrics.mrr_paise) : "—"}
        />
        <KpiCard
          icon={CreditCard}
          label="Active subscriptions"
          value={metrics?.active_subscriptions ?? 0}
        />
        <div className="space-y-1 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs">30-day churn</span>
          </div>
          <p className="text-2xl font-semibold text-foreground">
            {metrics ? `${(metrics.churn_30d * 100).toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {churnedCount} tenant{churnedCount === 1 ? "" : "s"} churned
          </p>
          <Button
            size="sm"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setChurnDetailsOpen(true)}
          >
            View details
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Tenants by status</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Tenant</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Period ends</th>
              <th className="px-4 py-2">Remaining</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const endDate = relevantEndDate(s);
              const days = daysRemaining(endDate);
              const indicator = getExpiryIndicator(s.status, days);
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    {s.tenants?.display_name ?? s.tenant_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">{s.plans?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>
                        {s.status}
                      </Badge>
                      {s.cancel_at_period_end && s.status !== "CANCELLED" && (
                        <Badge variant="outline" className="text-[10px]">
                          Cancel at period end
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {endDate ? new Date(endDate).toLocaleDateString() : "—"}
                    {s.status === "TRIAL" && <span className="ml-1 text-[10px]">(trial)</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-muted-foreground">{formatRemaining(days)}</span>
                    {indicator && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-2 gap-1 text-[10px]",
                          toneClasses[EXPIRY_INDICATOR[indicator].tone],
                        )}
                      >
                        {(() => {
                          const Icon = EXPIRY_INDICATOR[indicator].icon;
                          return <Icon className="h-3 w-3" />;
                        })()}
                        {EXPIRY_INDICATOR[indicator].label}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {formatPrice(s)}
                    {s.custom_price_paise != null && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Custom
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setManageTarget(s)}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!subs.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No subscriptions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ManageSubscriptionDialog subscription={manageTarget} onClose={() => setManageTarget(null)} />
      <ChurnDetailsDialog open={churnDetailsOpen} onClose={() => setChurnDetailsOpen(false)} />
    </div>
  );
}

function ManageSubscriptionDialog({
  subscription,
  onClose,
}: {
  subscription: SubscriptionRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const setPriceFn = useServerFn(setTenantCustomPrice);

  const [useCustom, setUseCustom] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset local form state whenever a different subscription is opened.
  const openId = subscription?.id ?? null;
  const [lastOpenId, setLastOpenId] = useState<string | null>(null);
  if (openId && openId !== lastOpenId) {
    setLastOpenId(openId);
    setUseCustom(subscription?.custom_price_paise != null);
    setPriceInput(
      subscription?.custom_price_paise != null ? String(subscription.custom_price_paise / 100) : "",
    );
    setError(null);
  }

  const save = useMutation({
    mutationFn: () => {
      if (!subscription) throw new Error("No subscription selected");
      if (!useCustom) {
        return setPriceFn({ data: { subscription_id: subscription.id, custom_price_paise: null } });
      }
      const rupees = Number(priceInput);
      if (!Number.isFinite(rupees) || rupees < 0) {
        throw new Error("Enter a valid, non-negative price");
      }
      return setPriceFn({
        data: { subscription_id: subscription.id, custom_price_paise: Math.round(rupees * 100) },
      });
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["all-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-metrics"] });
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e, "Could not update subscription")),
  });

  if (!subscription) {
    return <Dialog open={false} onOpenChange={() => onClose()} />;
  }

  const standardPrice = subscription.plans ? formatInr(subscription.plans.price_paise) : "—";
  const effectivePrice = formatInr(effectivePricePaise(subscription));

  return (
    <Dialog open={!!subscription} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            {subscription.tenants?.display_name ?? "This tenant"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Current plan</p>
              <p className="font-medium">{subscription.plans?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium">{subscription.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Billing interval</p>
              <p className="font-medium">{subscription.plans?.billing_interval ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Standard plan price</p>
              <p className="font-medium">{standardPrice}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Period start</p>
              <p className="font-medium">
                {subscription.current_period_start
                  ? new Date(subscription.current_period_start).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Period end</p>
              <p className="font-medium">
                {subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            {subscription.status === "TRIAL" && (
              <div>
                <p className="text-xs text-muted-foreground">Trial ends</p>
                <p className="font-medium">
                  {subscription.trial_ends_at
                    ? new Date(subscription.trial_ends_at).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            )}
          </div>

          {subscription.cancel_at_period_end && subscription.status !== "CANCELLED" && (
            <div className={cn("rounded-md p-3 text-xs", toneClasses.warning)}>
              Scheduled to cancel at period end — still {subscription.status} until then.
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Current effective price</p>
            <p className="text-base font-semibold">{effectivePrice}</p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="use-custom-price">Use custom price for this tenant</Label>
              <p className="text-xs text-muted-foreground">
                Overrides only {subscription.tenants?.display_name ?? "this tenant"} — the plan's
                standard price is unaffected for everyone else.
              </p>
            </div>
            <Switch id="use-custom-price" checked={useCustom} onCheckedChange={setUseCustom} />
          </div>

          {useCustom && (
            <div className="space-y-2">
              <Label htmlFor="custom-price-input">
                Custom price (₹ per{" "}
                {subscription.plans?.billing_interval?.toLowerCase() ?? "period"})
              </Label>
              <Input
                id="custom-price-input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
            </div>
          )}

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
