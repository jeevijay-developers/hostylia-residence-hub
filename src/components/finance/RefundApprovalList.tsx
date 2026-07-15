import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
        .select("id, refund_number, amount_paise, reason, initiated_by, initiated_at, students(full_name)")
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

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No pending refund approvals.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs">{r.refund_number}</p>
              <p className="font-medium">{r.students?.full_name ?? "—"} — {formatInr(r.amount_paise)}</p>
              <p className="text-sm text-muted-foreground">{r.reason}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => m.mutate({ id: r.id, decision: "APPROVED" })}>
                Approve
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => m.mutate({ id: r.id, decision: "REJECTED" })}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
