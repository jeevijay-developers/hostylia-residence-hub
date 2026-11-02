import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMyLeaveRequests } from "@/lib/leave";
import { requestLeave } from "@/lib/leave.functions";
import { cn, getErrorMessage, toneClasses, type SemanticTone } from "@/lib/utils";
import { leaveRequestSchema, type LeaveStatus } from "@/schemas/leave";

const STATUS_VIEW: Record<LeaveStatus, { label: string; tone: SemanticTone; icon: typeof Clock }> =
  {
    PENDING: { label: "Pending", tone: "warning", icon: Clock },
    APPROVED: { label: "Approved", tone: "success", icon: CheckCircle2 },
    REJECTED: { label: "Rejected", tone: "destructive", icon: XCircle },
  };

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function formatRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}

/**
 * Student-side leave: request form + request history with status and any
 * rejection reason. Only APPROVED requests affect attendance (derived
 * server-side); pending / rejected ones never do.
 */
export function LeaveRequestsPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const submit = useServerFn(requestLeave);
  const historyQ = useMyLeaveRequests(studentId);
  const today = todayIst();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Student Home's "Request Leave" links here with #leave-request.
  useEffect(() => {
    if (window.location.hash === "#leave-request") {
      document.getElementById("leave-request")?.scrollIntoView({ block: "start" });
    }
  }, []);

  const mut = useMutation({
    mutationFn: (input: {
      start_date: string;
      end_date: string;
      reason: string;
      remarks?: string;
    }) => submit({ data: input }),
    onSuccess: () => {
      toast.success("Leave request submitted. The hostel team has been notified.");
      setReason("");
      setRemarks("");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => setError(getErrorMessage(e, "Could not submit the leave request")),
  });

  function onSubmit() {
    setError(null);
    const parsed = leaveRequestSchema.safeParse({
      start_date: startDate,
      end_date: endDate,
      reason,
      remarks,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    if (parsed.data.start_date < today) {
      setError("Leave cannot start in the past");
      return;
    }
    mut.mutate(parsed.data);
  }

  const rows = historyQ.data ?? [];

  return (
    <section
      id="leave-request"
      className="scroll-mt-20 space-y-4 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-info" />
        <h2 className="font-display text-base font-bold text-foreground">Request leave</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Full-day leave, both dates included. Approved leave shows as "On Leave" in your attendance
        and is left out of your attendance percentage.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="leave-start">From</Label>
          <Input
            id="leave-start"
            type="date"
            className="scheme-light dark:scheme-dark"
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-end">To</Label>
          <Input
            id="leave-end"
            type="date"
            className="scheme-light dark:scheme-dark"
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leave-reason">Reason</Label>
        <Textarea
          id="leave-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leave-remarks">Remarks (optional)</Label>
        <Textarea
          id="leave-remarks"
          rows={2}
          maxLength={1000}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={mut.isPending} onClick={onSubmit}>
        {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit request
      </Button>

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Your requests</h3>
        {historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const view = STATUS_VIEW[r.status];
              const StatusIcon = view.icon;
              return (
                <li key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {formatRange(r.start_date, r.end_date)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        toneClasses[view.tone],
                      )}
                    >
                      <StatusIcon className="h-3.5 w-3.5" /> {view.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
                  {r.status === "REJECTED" && r.rejection_reason && (
                    <p className="mt-1 text-sm text-destructive">
                      Rejection reason: {r.rejection_reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
