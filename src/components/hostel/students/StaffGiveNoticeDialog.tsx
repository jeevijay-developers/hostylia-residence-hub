import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, CalendarClock, Loader2, RotateCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatIstDate, IST_TIME_ZONE } from "@/lib/ist";
import { localDateInTimezone } from "@/lib/ops";
import { staffGiveNotice } from "@/lib/student-admin.functions";
import { getErrorMessage } from "@/lib/utils";
import { staffGiveNoticeSchema } from "@/schemas/student";

import { DATE_INPUT_CLASS, StudentField } from "./StudentChargeFields";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface FormState {
  date: string;
  reason: string;
  remarks: string;
}
type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = { date: "", reason: "", remarks: "" };

const PATH_TO_FIELD: Record<string, keyof FormState> = {
  requested_move_out_date: "date",
  reason: "reason",
  remarks: "remarks",
};

/**
 * Staff records the move-out notice an ACTIVE student gave in person. The earliest date mirrors
 * fn_staff_give_notice (IST today + notice period, and never before the lock-in end); the RPC
 * re-checks everything.
 */
export function StaffGiveNoticeDialog({
  open,
  onOpenChange,
  allocationId,
  studentName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocationId: string;
  studentName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const giveNoticeFn = useServerFn(staffGiveNotice);

  const termsQ = useQuery({
    queryKey: ["students-tab", "notice-terms", allocationId],
    enabled: open && !!allocationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select("id, status, notice_period_days, lock_in_until")
        .eq("id", allocationId)
        .maybeSingle();
      if (error) throw new Error("We couldn't load this stay's notice terms. Please try again.");
      if (!data) throw new Error("This stay could not be found.");
      return data;
    },
  });

  const terms = termsQ.data;
  const noticePeriodDays = terms?.notice_period_days ?? 0;
  const earliest = useMemo(() => {
    const today = localDateInTimezone(IST_TIME_ZONE);
    return [today, addDays(today, noticePeriodDays), terms?.lock_in_until ?? today].reduce(
      (a, b) => (a > b ? a : b),
    );
  }, [noticePeriodDays, terms?.lock_in_until]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const patch = (next: Partial<FormState>) => setForm((f) => ({ ...f, ...next }));

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setIsSubmitted(false);
    }
  }, [open]);

  // Default to the earliest allowed date once the terms are known.
  useEffect(() => {
    if (open && terms) setForm((f) => (f.date ? f : { ...f, date: earliest }));
  }, [open, terms, earliest]);

  const validation = useMemo(() => {
    const errors: FieldErrors = {};
    const parsed = staffGiveNoticeSchema.safeParse({
      allocation_id: allocationId,
      requested_move_out_date: form.date,
      reason: form.reason,
      remarks: form.remarks,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = PATH_TO_FIELD[String(issue.path[0])];
        if (field && !errors[field]) {
          errors[field] = field === "date" ? "Choose the move-out date" : issue.message;
        }
      }
    }
    if (form.date && form.date < earliest && !errors.date) {
      errors.date = `Move-out can't be before ${formatIstDate(earliest)} (notice period / lock-in).`;
    }
    return { errors, input: parsed.success ? parsed.data : null };
  }, [allocationId, form, earliest]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!validation.input) throw new Error("Check the highlighted fields");
      return giveNoticeFn({ data: validation.input });
    },
    onSuccess: async () => {
      toast.success(`Move-out notice recorded for ${studentName}`, {
        description: `Moving out on ${formatIstDate(form.date)}.`,
      });
      await Promise.all(
        [["students-tab"], ["move-out-notices"], ["notifications"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not record the notice")),
  });

  const shownErrors: FieldErrors = isSubmitted ? validation.errors : {};
  const isBusy = mut.isPending;
  const canSubmit = terms?.status === "ACTIVE";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsSubmitted(true);
    if (!canSubmit || Object.keys(validation.errors).length > 0) return;
    mut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && isBusy ? undefined : onOpenChange(o))}>
      <DialogContent className="flex max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="h-5 w-5 text-warning" />
            Record move-out notice
          </DialogTitle>
          <DialogDescription>
            For when {studentName} gives notice in person. They keep the bed until the move-out is
            completed; guardians and staff are notified.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {termsQ.isPending ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <span className="sr-only">Loading notice terms…</span>
              </div>
            ) : termsQ.isError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">{termsQ.error.message}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => termsQ.refetch()}>
                  <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : !canSubmit ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Only an active stay can take a move-out notice. This stay is{" "}
                {(terms?.status ?? "").toLowerCase().replace(/_/g, " ")}.
              </p>
            ) : (
              <>
                <StudentField
                  id="staff-notice-date"
                  label="Move-out date"
                  isRequired
                  error={shownErrors.date}
                  hint={`Earliest allowed: ${formatIstDate(earliest)}${
                    noticePeriodDays > 0 ? ` (${noticePeriodDays}-day notice period)` : ""
                  }.`}
                >
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="date"
                      min={earliest}
                      className={DATE_INPUT_CLASS}
                      disabled={isBusy}
                      value={form.date}
                      onChange={(e) => patch({ date: e.target.value })}
                    />
                  )}
                </StudentField>
                <StudentField
                  id="staff-notice-reason"
                  label="Reason given"
                  isRequired
                  error={shownErrors.reason}
                >
                  {(a11y) => (
                    <Textarea
                      {...a11y}
                      rows={3}
                      maxLength={500}
                      placeholder="e.g. Course completed, shifting to family home"
                      disabled={isBusy}
                      value={form.reason}
                      onChange={(e) => patch({ reason: e.target.value })}
                    />
                  )}
                </StudentField>
                <StudentField
                  id="staff-notice-remarks"
                  label="Remarks (optional)"
                  error={shownErrors.remarks}
                >
                  {(a11y) => (
                    <Textarea
                      {...a11y}
                      rows={2}
                      maxLength={1000}
                      disabled={isBusy}
                      value={form.remarks}
                      onChange={(e) => patch({ remarks: e.target.value })}
                    />
                  )}
                </StudentField>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-card px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy || !canSubmit}>
              {isBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock aria-hidden="true" className="h-4 w-4" />
              )}
              {isBusy ? "Recording…" : "Record notice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
