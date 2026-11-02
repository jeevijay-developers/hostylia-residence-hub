import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, DoorOpen, Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useMyNotice } from "@/lib/student-notice";
import { giveNotice } from "@/lib/student.functions";
import { giveNoticeSchema } from "@/schemas/student";

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Give Notice action for the Room / Bed card. Only an ACTIVE allocation can
 * give notice (the give_notice RPC re-checks ownership, status and the minimum
 * date server-side); once submitted it shows a "Notice given" state instead.
 */
export function GiveNoticeAction({ allocationId }: { allocationId: string }) {
  const [open, setOpen] = useState(false);
  const noticeQ = useMyNotice(allocationId);
  const notice = noticeQ.data;

  if (!notice) return null;
  if (notice.status === "NOTICE_GIVEN") {
    return (
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
        <CalendarClock className="h-3.5 w-3.5" /> Notice given
      </span>
    );
  }
  if (notice.status !== "ACTIVE") return null;

  return (
    <>
      <Button size="sm" variant="outline" className="mt-3 min-h-9" onClick={() => setOpen(true)}>
        <DoorOpen className="h-4 w-4" /> Give Notice
      </Button>
      <GiveNoticeDialog
        open={open}
        onOpenChange={setOpen}
        allocationId={allocationId}
        noticePeriodDays={notice.notice_period_days ?? 0}
        lockInUntil={notice.lock_in_until}
      />
    </>
  );
}

function GiveNoticeDialog({
  open,
  onOpenChange,
  allocationId,
  noticePeriodDays,
  lockInUntil,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocationId: string;
  noticePeriodDays: number;
  lockInUntil: string | null;
}) {
  const qc = useQueryClient();
  const giveNoticeFn = useServerFn(giveNotice);
  const today = todayIst();
  const earliest = [today, addDays(today, noticePeriodDays), lockInUntil ?? today].reduce((a, b) =>
    a > b ? a : b,
  );
  const [date, setDate] = useState(earliest);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (input: {
      allocation_id: string;
      requested_move_out_date: string;
      reason: string;
      remarks?: string;
    }) => giveNoticeFn({ data: input }),
    onSuccess: () => {
      toast.success("Notice submitted. The hostel team has been notified.");
      onOpenChange(false);
      for (const key of [
        ["my-move-out-notice"],
        ["my-current-allocation"],
        ["student-allocations"],
        ["notifications"],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not submit the notice"),
  });

  function submit() {
    setError(null);
    const parsed = giveNoticeSchema.safeParse({
      allocation_id: allocationId,
      requested_move_out_date: date,
      reason,
      remarks,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    if (parsed.data.requested_move_out_date < earliest) {
      setError(`Move-out date must be on or after ${earliest} (notice period / lock-in).`);
      return;
    }
    mut.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give move-out notice</DialogTitle>
          <DialogDescription>
            Your room stays yours until the hostel team completes your move-out. A notice can be
            submitted once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notice-date">Proposed move-out date</Label>
            <Input
              id="notice-date"
              type="date"
              value={date}
              min={earliest}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Earliest allowed: {earliest}
              {noticePeriodDays > 0 ? ` (${noticePeriodDays}-day notice period)` : ""}.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-reason">Reason for leaving</Label>
            <Textarea
              id="notice-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-remarks">Additional remarks (optional)</Label>
            <Textarea
              id="notice-remarks"
              rows={2}
              maxLength={1000}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={mut.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mut.isPending} onClick={submit}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit notice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Submitted notice details, shown on the Student dashboard once NOTICE_GIVEN. */
export function MoveOutNoticeStatusCard({ allocationId }: { allocationId: string }) {
  const noticeQ = useMyNotice(allocationId);
  const n = noticeQ.data;
  if (!n || n.status !== "NOTICE_GIVEN") return null;

  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-warning" />
        <h2 className="font-display text-base font-bold text-foreground">
          Move-out notice submitted
        </h2>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Notice date</dt>
          <dd className="font-medium text-foreground">
            {n.notice_given_at ? new Date(n.notice_given_at).toLocaleDateString("en-IN") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Proposed move-out</dt>
          <dd className="font-medium text-foreground">{n.requested_move_out_date ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Reason</dt>
          <dd className="text-foreground">{n.notice_reason ?? "—"}</dd>
        </div>
        {n.notice_remarks && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Remarks</dt>
            <dd className="text-foreground">{n.notice_remarks}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Status: awaiting review. Your bed stays allocated to you until the hostel team completes
        your move-out; any dues are settled against your deposit and the remainder is refunded after
        approval.
      </p>
    </div>
  );
}
