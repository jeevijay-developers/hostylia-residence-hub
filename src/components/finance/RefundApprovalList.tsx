import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { decideRefund } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";

export function RefundApprovalList({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideRefund);

  const q = useQuery({
    queryKey: ["refunds", propertyId, "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          "id, refund_number, amount_paise, reason, initiated_by, initiated_at, students(full_name)",
        )
        .eq("property_id", propertyId)
        .eq("status", "PENDING_APPROVAL")
        .order("initiated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async (args: { id: string; decision: "APPROVED" | "REJECTED" }) =>
      decide({ data: { refund_id: args.id, decision: args.decision } }),
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["refunds"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <h2 className="font-display text-base font-semibold text-foreground">
          Pending refund approvals
        </h2>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : !rows.length ? (
        <EmptyState
          title="No pending refund approvals"
          description="Refund requests awaiting a decision will appear here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{r.refund_number}</p>
                <p className="font-semibold text-foreground">
                  {r.students?.full_name ?? "—"} — {formatInr(r.amount_paise)}
                </p>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => m.mutate({ id: r.id, decision: "APPROVED" })}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => m.mutate({ id: r.id, decision: "REJECTED" })}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
