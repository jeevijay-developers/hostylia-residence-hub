import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { processRefund, syncRefundStatus } from "@/lib/finance.functions";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  "ALL",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const REFUND_STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-info/10 text-info",
  PROCESSING: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

// Max gateway attempts — mirrors fn_start_refund_processing.
const MAX_GATEWAY_ATTEMPTS = 5;

// The gateway columns (migration 20261109090000) are not in the generated types yet, so this
// query is typed by hand and every row is validated with Zod.
const refundRowSchema = z.object({
  id: z.string(),
  refund_number: z.string(),
  amount_paise: z.number(),
  reason: z.string(),
  status: z.string(),
  decision_reason: z.string().nullable(),
  initiated_at: z.string(),
  approved_at: z.string().nullable(),
  provider_refund_ref: z.string().nullable().optional(),
  provider_status: z.string().nullable().optional(),
  attempt_count: z.number().optional(),
  last_error: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  students: z.object({ full_name: z.string(), admission_number: z.string().nullable() }).nullable(),
  payments: z.object({ provider: z.string().nullable() }).nullable(),
  properties: z.object({ name: z.string() }).nullable(),
});
type RefundRow = z.infer<typeof refundRowSchema>;

interface RefundQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(columns: string): RefundQuery;
  eq(column: string, value: string): RefundQuery;
  order(column: string, opts: { ascending: boolean }): RefundQuery;
  limit(n: number): RefundQuery;
}

/**
 * Refund status/history — RefundRequestForm only submits new refunds and
 * had no view of what was already requested/approved/rejected. With `canProcess`
 * (Accountant / Admin) it also carries an approved gateway refund through to
 * completion: gateway payments are sent to the gateway and COMPLETED only when
 * the gateway confirms. Offline (CASH/cheque/bank-transfer) refunds have no
 * in-app completion action here — they stay APPROVED until completed another way.
 */
export function RefundHistoryPanel({
  propertyId,
  canProcess = false,
}: {
  propertyId: string;
  canProcess?: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["refunds", propertyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("refunds" as never) as unknown as RefundQuery)
        .select(
          "id, refund_number, amount_paise, reason, status, decision_reason, initiated_at, approved_at, provider_refund_ref, provider_status, attempt_count, last_error, failure_reason, students(full_name, admission_number), payments(provider), properties(name)",
        )
        .eq("property_id", propertyId)
        .order("initiated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return z.array(refundRowSchema).parse(data ?? []);
    },
    // A PROCESSING gateway refund can be confirmed by webhook at any time.
    refetchInterval: (query) =>
      (query.state.data as RefundRow[] | undefined)?.some((r) => r.status === "PROCESSING")
        ? 30_000
        : false,
  });

  const processFn = useServerFn(processRefund);
  const syncFn = useServerFn(syncRefundStatus);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["refunds"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };
  const report = (res: { state?: string; message?: string }) => {
    if (res.state === "COMPLETED") toast.success("Refund completed — confirmed by the gateway");
    else if (res.state === "FAILED")
      toast.error(res.message ?? "The gateway could not process this refund");
    else toast.info(res.message ?? "Refund is being processed by the gateway");
    refresh();
  };
  const processMut = useMutation({
    mutationFn: (id: string) => processFn({ data: { refund_id: id } }),
    onSuccess: report,
    onError: (e) => {
      toast.error(getErrorMessage(e, "Could not process the refund"));
      refresh();
    },
  });
  const syncMut = useMutation({
    mutationFn: (id: string) => syncFn({ data: { refund_id: id } }),
    onSuccess: report,
    onError: (e) => toast.error(getErrorMessage(e, "Could not check the refund status")),
  });
  const busy = processMut.isPending || syncMut.isPending;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const filtered = (q.data ?? []).filter(
    (r) => statusFilter === "ALL" || r.status === statusFilter,
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
            <History className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold text-foreground">Refund history</h2>
        </div>
        {!!q.data?.length && (
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  statusFilter === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/80 text-muted-foreground hover:bg-muted/40",
                )}
              >
                {s === "ALL" ? "All" : s.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : q.isError ? (
        <EmptyState
          title="Couldn't load refund history"
          description={getErrorMessage(q.error, "Something went wrong while fetching refunds.")}
          action={{ label: "Retry", onClick: () => q.refetch() }}
        />
      ) : !q.data?.length ? (
        <EmptyState
          title="No refund requests yet"
          description="Your refund requests will appear here."
        />
      ) : !filtered.length ? (
        <EmptyState
          title="No matching refund requests"
          description="Try a different status filter."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const viaGateway = r.payments?.provider === "razorpay";
            const attempts = r.attempt_count ?? 0;
            const canRetry = r.status === "FAILED" && viaGateway && attempts < MAX_GATEWAY_ATTEMPTS;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border/80 bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-foreground">
                    {r.refund_number} · {r.students?.full_name ?? "—"}
                    {r.students?.admission_number && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        ({r.students.admission_number})
                      </span>
                    )}
                  </p>
                  <Badge className={cn("shrink-0", REFUND_STATUS_TONE[r.status] ?? "")}>
                    {r.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                {r.properties?.name && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{r.properties.name}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatInr(r.amount_paise)} · {r.reason}
                </p>
                {r.decision_reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Decision: {r.decision_reason}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Requested {new Date(r.initiated_at).toLocaleDateString()}
                  {r.approved_at && ` · Decided ${new Date(r.approved_at).toLocaleDateString()}`}
                </p>
                {r.status === "PROCESSING" && viaGateway && (
                  <p className="mt-1 text-xs text-info">
                    {r.provider_refund_ref
                      ? `Waiting for the gateway to confirm (${r.provider_refund_ref}).`
                      : "Sent to the gateway — no confirmation yet."}
                  </p>
                )}
                {r.status === "COMPLETED" && r.provider_refund_ref && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reference: {r.provider_refund_ref}
                  </p>
                )}
                {(r.status === "FAILED" || r.status === "PROCESSING") &&
                  (r.failure_reason || r.last_error) && (
                    <p className="mt-1 text-xs text-destructive">
                      {r.failure_reason ?? r.last_error}
                    </p>
                  )}

                {canProcess && viaGateway && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.status === "APPROVED" && (
                      <Button size="sm" disabled={busy} onClick={() => processMut.mutate(r.id)}>
                        {processMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Process refund
                      </Button>
                    )}
                    {r.status === "PROCESSING" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => syncMut.mutate(r.id)}
                        >
                          {syncMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Check status
                        </Button>
                        {!r.provider_refund_ref && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => processMut.mutate(r.id)}
                          >
                            Retry gateway request
                          </Button>
                        )}
                      </>
                    )}
                    {canRetry && (
                      <Button size="sm" disabled={busy} onClick={() => processMut.mutate(r.id)}>
                        Retry ({attempts}/{MAX_GATEWAY_ATTEMPTS} attempts)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
