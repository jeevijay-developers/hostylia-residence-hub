import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePropertyLeaveRequests } from "@/lib/leave";
import { reviewLeaveRequest } from "@/lib/leave.functions";
import { getErrorMessage } from "@/lib/utils";

/**
 * Pending leave requests for a property, with Approve / Reject. Visibility is
 * enforced by RLS (attendance view scope) and the decision by
 * review_leave_request() (attendance edit scope) — a staff member without
 * access simply gets an empty list, so the panel renders nothing.
 */
export function LeaveReviewPanel({ propertyId }: { propertyId: string | null }) {
  const qc = useQueryClient();
  const review = useServerFn(reviewLeaveRequest);
  const pendingQ = usePropertyLeaveRequests(propertyId, "PENDING");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const mut = useMutation({
    mutationFn: (input: {
      request_id: string;
      decision: "APPROVED" | "REJECTED";
      rejection_reason?: string;
    }) => review({ data: input }),
    onSuccess: (_out, vars) => {
      toast.success(vars.decision === "APPROVED" ? "Leave approved" : "Leave rejected");
      setRejectingId(null);
      setRejectionReason("");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update the leave request")),
  });

  const rows = pendingQ.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-info/30 bg-info/5 p-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-info" />
        <h2 className="font-display text-base font-bold text-foreground">
          Leave requests awaiting review ({rows.length})
        </h2>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {r.students?.full_name ?? "Student"}
                  {r.students?.admission_number ? ` · ${r.students.admission_number}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ request_id: r.id, decision: "APPROVED" })}
                >
                  {mut.isPending && mut.variables?.request_id === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mut.isPending}
                  onClick={() => {
                    setRejectingId(rejectingId === r.id ? null : r.id);
                    setRejectionReason("");
                  }}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground">{r.reason}</p>
            {r.remarks && <p className="text-xs text-muted-foreground">{r.remarks}</p>}
            {rejectingId === r.id && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Rejection reason (shown to the student)"
                  value={rejectionReason}
                  maxLength={500}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mut.isPending || rejectionReason.trim().length < 3}
                  onClick={() =>
                    mut.mutate({
                      request_id: r.id,
                      decision: "REJECTED",
                      rejection_reason: rejectionReason.trim(),
                    })
                  }
                >
                  Confirm reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
