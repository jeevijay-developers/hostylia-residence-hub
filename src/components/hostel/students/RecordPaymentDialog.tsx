import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, ReceiptIndianRupee, RotateCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordManualPayment } from "@/lib/finance.functions";
import { formatIstDate } from "@/lib/ist";
import { useStudentForEdit } from "@/lib/property-students";
import { formatRupees, paiseToRupeesText } from "@/lib/student-placement";
import { getErrorMessage } from "@/lib/utils";
import {
  rupeesTextField,
  rupeesTextToPaise,
  studentPaymentSchema,
  type OfflinePaymentMode,
} from "@/schemas/student";

import {
  PaymentModeToggle,
  PaymentReferenceFields,
  RupeeInput,
  StudentField,
} from "./StudentChargeFields";

interface FormState {
  invoiceId: string;
  amountRupees: string;
  mode: OfflinePaymentMode;
  reference: string;
  chequeDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  invoiceId: "",
  amountRupees: "",
  mode: "CASH",
  reference: "",
  chequeDate: "",
  notes: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const PAYMENT_PATH_TO_FIELD: Record<string, keyof FormState> = {
  amount_paise: "amountRupees",
  mode: "mode",
  reference: "reference",
  cheque_date: "chequeDate",
};

/**
 * Records an offline payment against one of the student's unpaid invoices via
 * record_manual_payment (which also activates a stay awaiting its first payment).
 */
export function RecordPaymentDialog({
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
  const snapshotQ = useStudentForEdit(open ? studentId : null);
  const invoices = useMemo(() => snapshotQ.data?.openInvoices ?? [], [snapshotQ.data]);
  const recordFn = useServerFn(recordManualPayment);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const patch = (next: Partial<FormState>) => setForm((f) => ({ ...f, ...next }));

  // Closing discards the draft so the next student starts clean.
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setIsSubmitted(false);
    }
  }, [open]);

  // With a single unpaid invoice there is nothing to choose.
  useEffect(() => {
    if (open && invoices.length === 1 && !form.invoiceId) {
      const only = invoices[0];
      setForm((f) => ({
        ...f,
        invoiceId: only.id,
        amountRupees: paiseToRupeesText(only.balance_paise),
      }));
    }
  }, [open, invoices, form.invoiceId]);

  const selected = invoices.find((i) => i.id === form.invoiceId) ?? null;

  const validation = useMemo(() => {
    const errors: FieldErrors = {};
    if (!selected) errors.invoiceId = "Choose the invoice being paid";
    const amountText = rupeesTextField.safeParse(form.amountRupees);
    if (!amountText.success) {
      errors.amountRupees = amountText.error.issues[0]?.message ?? "Enter a valid amount";
    }
    const amountPaise = rupeesTextToPaise(form.amountRupees);
    const parsed = studentPaymentSchema.safeParse({
      amount_paise: amountPaise,
      mode: form.mode,
      reference: form.mode === "CASH" ? "" : form.reference,
      cheque_date: form.mode === "CHEQUE" ? form.chequeDate : "",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = PAYMENT_PATH_TO_FIELD[String(issue.path[0])];
        if (field && !errors[field]) errors[field] = issue.message;
      }
    }
    if (selected && amountPaise > selected.balance_paise && !errors.amountRupees) {
      errors.amountRupees = `Can't be more than the balance of ${formatRupees(selected.balance_paise)}`;
    }
    if (form.notes.trim().length > 500) errors.notes = "Notes can be at most 500 characters";
    return { errors, payment: parsed.success ? parsed.data : null };
  }, [form, selected]);

  const mut = useMutation({
    mutationFn: async () => {
      const { payment } = validation;
      if (!selected || !payment) throw new Error("Check the highlighted fields");
      return recordFn({
        data: {
          invoice_id: selected.id,
          mode: payment.mode,
          amount_paise: payment.amount_paise,
          offline_reference: payment.reference ?? "",
          cheque_date: payment.cheque_date ?? "",
          notes: form.notes.trim(),
        },
      });
    },
    onSuccess: async (out) => {
      toast.success(`Payment recorded: ${out.payment_number}`, {
        description: `${studentName} — receipt is being generated.`,
      });
      await Promise.all(
        [["students-tab"], ["open-invoices"], ["invoices"], ["payments"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not record the payment")),
  });

  const shownErrors: FieldErrors = isSubmitted ? validation.errors : {};

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // This dialog can open from inside another form dialog; keep the submit from reaching it.
    e.stopPropagation();
    setIsSubmitted(true);
    if (Object.keys(validation.errors).length > 0) return;
    mut.mutate();
  }

  const isBusy = mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && isBusy ? undefined : onOpenChange(o))}>
      <DialogContent className="flex max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIndianRupee aria-hidden="true" className="h-5 w-5 text-primary" />
            Record payment
          </DialogTitle>
          <DialogDescription>
            Offline payment from {studentName}. A receipt is issued automatically.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {snapshotQ.isPending ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
                <span className="sr-only">Loading unpaid invoices…</span>
              </div>
            ) : snapshotQ.isError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  {getErrorMessage(snapshotQ.error, "Couldn't load the student's invoices.")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => snapshotQ.refetch()}
                >
                  <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-success" />
                <p className="text-sm font-medium text-foreground">No unpaid invoices</p>
                <p className="text-xs text-muted-foreground">
                  {studentName} has nothing outstanding right now. Add a charge from Edit details if
                  money is owed.
                </p>
              </div>
            ) : (
              <>
                <StudentField
                  id="record-payment-invoice"
                  label="Invoice"
                  isRequired
                  error={shownErrors.invoiceId}
                >
                  {(a11y) => (
                    <Select
                      disabled={isBusy}
                      value={form.invoiceId}
                      onValueChange={(invoiceId) => {
                        const inv = invoices.find((i) => i.id === invoiceId);
                        patch({
                          invoiceId,
                          amountRupees: inv ? paiseToRupeesText(inv.balance_paise) : "",
                        });
                      }}
                    >
                      <SelectTrigger {...a11y}>
                        <SelectValue placeholder="Choose an unpaid invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number} · due {formatIstDate(inv.due_date)} ·{" "}
                            {formatRupees(inv.balance_paise)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </StudentField>
                {selected?.notes && (
                  <p className="-mt-2 text-xs text-muted-foreground">{selected.notes}</p>
                )}

                <StudentField
                  id="record-payment-amount"
                  label="Amount received"
                  isRequired
                  error={shownErrors.amountRupees}
                  hint={
                    selected
                      ? `Balance ${formatRupees(selected.balance_paise)} of ${formatRupees(selected.total_paise)}`
                      : undefined
                  }
                >
                  {(a11y) => (
                    <RupeeInput
                      {...a11y}
                      disabled={isBusy}
                      value={form.amountRupees}
                      onChange={(amountRupees) => patch({ amountRupees })}
                    />
                  )}
                </StudentField>

                <PaymentModeToggle
                  id="record-payment-mode"
                  disabled={isBusy}
                  value={form.mode}
                  onChange={(mode) => patch({ mode })}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <PaymentReferenceFields
                    idPrefix="record-payment"
                    mode={form.mode}
                    reference={form.reference}
                    chequeDate={form.chequeDate}
                    onReferenceChange={(reference) => patch({ reference })}
                    onChequeDateChange={(chequeDate) => patch({ chequeDate })}
                    errors={{
                      reference: shownErrors.reference,
                      chequeDate: shownErrors.chequeDate,
                    }}
                    disabled={isBusy}
                  />
                </div>

                <StudentField
                  id="record-payment-notes"
                  label="Notes (optional)"
                  error={shownErrors.notes}
                >
                  {(a11y) => (
                    <Textarea
                      {...a11y}
                      rows={2}
                      maxLength={500}
                      disabled={isBusy}
                      value={form.notes}
                      onChange={(e) => patch({ notes: e.target.value })}
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
              {invoices.length === 0 ? "Close" : "Cancel"}
            </Button>
            {invoices.length > 0 && (
              <Button type="submit" disabled={isBusy}>
                {isBusy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptIndianRupee aria-hidden="true" className="h-4 w-4" />
                )}
                {isBusy ? "Recording…" : "Record payment"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
