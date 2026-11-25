import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { decideRefund } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";
import { getErrorMessage } from "@/lib/utils";

/**
 * Hostel-Admin-only refund approval queue. The actual first-decision-wins /
 * role / self-approval enforcement all lives in fn_approve_refund (a row-locked
 * SECURITY DEFINER function) — this component only renders the request and
 * forwards whichever decision note was typed; it never assumes its own button
 * state is the real guard (the server call can still fail if, e.g., a second
 * Hostel Admin already decided this request a moment ago).
 */
export function RefundApprovalList({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideRefund);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["refunds", propertyId, "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          "id, refund_number, amount_paise, reason, initiated_by, initiated_at, students(full_name, admission_number)",
        )
        .eq("property_id", propertyId)
        .eq("status", "PENDING_APPROVAL")
        .order("initiated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async (args: { id: string; decision: "APPROVED" | "REJECTED"; reason: string }) =>
      decide({ data: { refund_id: args.id, decision: args.decision, reason: args.reason } }),
    onSuccess: (_out, args) => {
      toast.success(args.decision === "APPROVED" ? "Refund approved" : "Refund rejected");
      setNotes((prev) => ({ ...prev, [args.id]: "" }));
      qc.invalidateQueries({ queryKey: ["refunds"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not record the decision")),
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
          {rows.map((r) => {
            const note = notes[r.id] ?? "";
            const busy = m.isPending && m.variables?.id === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <p className="font-mono text-xs text-muted-foreground">{r.refund_number}</p>
                <p className="font-semibold text-foreground">
                  {r.students?.full_name ?? "—"}
                  {r.students?.admission_number && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      ({r.students.admission_number})
                    </span>
                  )}{" "}
                  — {formatInr(r.amount_paise)}
                </p>
                <p className="text-sm text-muted-foreground">{r.reason}</p>

                <Textarea
                  rows={2}
                  className="mt-2"
                  placeholder="Decision note (required to reject, optional to approve)"
                  value={note}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                />
                <div className="mt-2 flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      m.mutate({ id: r.id, decision: "APPROVED", reason: note.trim() })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || note.trim().length < 3}
                    onClick={() =>
                      m.mutate({ id: r.id, decision: "REJECTED", reason: note.trim() })
                    }
                  >
                    Reject
                  </Button>
                </div>
                {note.trim().length < 3 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Add a reason (at least 3 characters) before rejecting.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
