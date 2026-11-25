import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

const REFUND_STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  PENDING_VERIFICATION: "bg-warning/10 text-warning",
  APPROVED: "bg-info/10 text-info",
  PROCESSING: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const studentRefundRowSchema = z.object({
  id: z.string(),
  refund_number: z.string(),
  amount_paise: z.number(),
  reason: z.string(),
  status: z.string(),
  decision_reason: z.string().nullable(),
  initiated_at: z.string(),
  approved_at: z.string().nullable(),
});

/**
 * Read-only "My Refund Requests" for the Student panel — Part 1 of the new
 * refund workflow. Deliberately shows status/decision only: no approve/
 * reject/process/complete actions exist here, by design (those are staff-only
 * and out of scope for this part). Receipt information isn't shown yet since
 * no part of the payout/receipt workflow exists in the schema today.
 */
export function StudentRefundHistory({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["student-refunds", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          "id, refund_number, amount_paise, reason, status, decision_reason, initiated_at, approved_at",
        )
        .eq("student_id", studentId)
        .order("initiated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return z.array(studentRefundRowSchema).parse(data ?? []);
    },
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
          <History className="h-4 w-4" />
        </span>
        <h2 className="font-display text-base font-semibold text-foreground">My refund requests</h2>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : q.isError ? (
        <EmptyState
          title="Couldn't load your refund requests"
          description={getErrorMessage(q.error, "Something went wrong while fetching this.")}
        />
      ) : !q.data?.length ? (
        <EmptyState
          title="No refund requests yet"
          description="Requests you submit will show up here with their current status."
        />
      ) : (
        <div className="space-y-2">
          {q.data.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/80 bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-foreground">{r.refund_number}</p>
                <Badge className={cn("shrink-0", REFUND_STATUS_TONE[r.status] ?? "")}>
                  {r.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatInr(r.amount_paise)} · {r.reason}
              </p>
              {r.decision_reason && (
                <p className="mt-1 text-xs text-muted-foreground">Decision: {r.decision_reason}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Requested {new Date(r.initiated_at).toLocaleDateString()}
                {r.approved_at && ` · Decided ${new Date(r.approved_at).toLocaleDateString()}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
