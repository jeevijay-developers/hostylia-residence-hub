import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { cn } from "@/lib/utils";

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

/**
 * Refund status/history — RefundRequestForm only submits new refunds and
 * had no view of what was already requested/approved/rejected.
 */
export function RefundHistoryPanel({ propertyId }: { propertyId: string }) {
  const q = useQuery({
    queryKey: ["refunds", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refunds")
        .select(
          "id, refund_number, amount_paise, reason, status, decision_reason, initiated_at, approved_at, students(full_name)",
        )
        .eq("property_id", propertyId)
        .order("initiated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!q.data?.length) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No refund requests yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {q.data.map((r) => (
        <div key={r.id} className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {r.refund_number} · {r.students?.full_name ?? "—"}
            </p>
            <Badge className={cn(REFUND_STATUS_TONE[r.status] ?? "")}>
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
  );
}
