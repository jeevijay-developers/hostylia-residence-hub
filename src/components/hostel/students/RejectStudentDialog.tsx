import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserX } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setStudentReviewStatus } from "@/lib/student-admin.functions";
import { getErrorMessage } from "@/lib/utils";
import { studentReviewStatusSchema } from "@/schemas/student";

import { StudentField } from "./StudentChargeFields";

/** APPLICANT | VERIFIED -> REJECTED with a mandatory reason (stored and audited by the RPC). */
export function RejectStudentDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(setStudentReviewStatus);
  const [reason, setReason] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setIsSubmitted(false);
    }
  }, [open]);

  const parsed = useMemo(
    () =>
      studentReviewStatusSchema.safeParse({ student_id: studentId, status: "REJECTED", reason }),
    [studentId, reason],
  );
  const reasonError =
    isSubmitted && !parsed.success
      ? (parsed.error.issues.find((i) => i.path[0] === "reason")?.message ??
        parsed.error.issues[0]?.message)
      : undefined;

  const mut = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("Give a reason for rejecting");
      return reviewFn({ data: parsed.data });
    },
    onSuccess: async () => {
      toast.success(`${studentName} marked as rejected`);
      await qc.invalidateQueries({ queryKey: ["students-tab"] });
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not reject the student")),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsSubmitted(true);
    if (!parsed.success) return;
    mut.mutate();
  }

  const isBusy = mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && isBusy ? undefined : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX aria-hidden="true" className="h-5 w-5 text-destructive" />
              Reject {studentName}?
            </DialogTitle>
            <DialogDescription>
              The application is closed and the student can't be given a bed. You can restore them
              to applicant later from the Actions menu.
            </DialogDescription>
          </DialogHeader>
          <StudentField id="reject-student-reason" label="Reason" isRequired error={reasonError}>
            {(a11y) => (
              <Textarea
                {...a11y}
                rows={3}
                maxLength={500}
                placeholder="e.g. Documents could not be verified"
                disabled={isBusy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </StudentField>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isBusy}>
              {isBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <UserX aria-hidden="true" className="h-4 w-4" />
              )}
              {isBusy ? "Rejecting…" : "Reject student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
