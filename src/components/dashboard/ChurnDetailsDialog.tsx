import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, differenceInMonths } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listChurnedTenants, listPlans } from "@/lib/super-admin.functions";
import { CANCELLATION_REASON_LABELS, type CancellationReason } from "@/schemas/subscription";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatUsageDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const start = new Date(startIso);
  const end = new Date(endIso);
  const months = differenceInMonths(end, start);
  if (months < 1) {
    const days = Math.max(0, differenceInCalendarDays(end, start));
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const remainderStart = new Date(start);
  remainderStart.setMonth(remainderStart.getMonth() + months);
  const days = Math.max(0, differenceInCalendarDays(end, remainderStart));
  return `${months} month${months === 1 ? "" : "s"}${days ? ` ${days} day${days === 1 ? "" : "s"}` : ""}`;
}

type ChurnedRow = {
  id: string;
  tenant_id: string;
  starts_at: string | null;
  cancelled_at: string | null;
  custom_price_paise: number | null;
  tenants: { display_name: string } | null;
  plans: { name: string; price_paise: number; billing_interval: string } | null;
  subscription_cancellations:
    | {
        cancellation_reason: string;
        cancellation_reason_other: string | null;
        continue_in_future: boolean | null;
        additional_feedback: string | null;
      }[]
    | null;
};

export function ChurnDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const listChurnedFn = useServerFn(listChurnedTenants);
  const listPlansFn = useServerFn(listPlans);

  const [planId, setPlanId] = useState<string>("ALL");
  const [reason, setReason] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => listPlansFn({}),
    enabled: open,
  });

  const { data: churned = [], isLoading } = useQuery({
    queryKey: ["churned-tenants", planId, reason, from, to],
    queryFn: () =>
      listChurnedFn({
        data: {
          plan_id: planId === "ALL" ? null : planId,
          cancellation_reason: reason === "ALL" ? null : reason,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to).toISOString() : null,
        },
      }),
    enabled: open,
  });

  // The generated Supabase types don't resolve this reverse-FK embed
  // cleanly (same "GenericStringError" class already present elsewhere in
  // this codebase for complex embedded selects); the runtime shape is
  // correct (verified live), only the static type is unknown here.
  const rows = churned as unknown as ChurnedRow[];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>30-day churn details</DialogTitle>
          <DialogDescription>
            Tenants whose subscription was cancelled in the current 30-day churn window.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All plans</SelectItem>
                {plans.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All reasons</SelectItem>
                {(Object.keys(CANCELLATION_REASON_LABELS) as CancellationReason[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {CANCELLATION_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Cancelled</th>
                <th className="px-3 py-2">Used for</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Continue?</th>
                <th className="px-3 py-2">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const feedback = r.subscription_cancellations?.[0] ?? null;
                const effectivePrice = r.custom_price_paise ?? r.plans?.price_paise ?? null;
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{r.tenants?.display_name ?? "—"}</td>
                    <td className="px-3 py-2">{r.plans?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.starts_at ? new Date(r.starts_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.cancelled_at ? new Date(r.cancelled_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {formatUsageDuration(r.starts_at, r.cancelled_at)}
                    </td>
                    <td className="px-3 py-2">
                      {effectivePrice != null && r.plans
                        ? `${formatInr(effectivePrice)}/${r.plans.billing_interval?.toLowerCase()}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {feedback
                        ? feedback.cancellation_reason === "OTHER"
                          ? (feedback.cancellation_reason_other ?? "Other")
                          : (CANCELLATION_REASON_LABELS[
                              feedback.cancellation_reason as CancellationReason
                            ] ?? feedback.cancellation_reason)
                        : "Not provided"}
                    </td>
                    <td className="px-3 py-2">
                      {feedback
                        ? feedback.continue_in_future == null
                          ? "Not provided"
                          : feedback.continue_in_future
                            ? "Yes"
                            : "No"
                        : "Not provided"}
                    </td>
                    <td className="px-3 py-2 max-w-xs text-muted-foreground">
                      {feedback?.additional_feedback || "Not provided"}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && !rows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No churned tenants in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
