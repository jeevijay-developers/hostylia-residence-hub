import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, IndianRupee, Info, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconFormField as FormField } from "@/components/ui/icon-field";
import { supabase } from "@/integrations/supabase/client";
import { initiateRefund } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";

/**
 * Student-facing refund request — Part 1 of the new refund workflow.
 * Reuses the existing `initiateRefund` server function unchanged (same one
 * RefundRequestForm.tsx uses for staff); the only new piece is the RLS
 * policy (refunds_student_insert) that lets a student's own insert through.
 * Payment mode is fixed to ORIGINAL_METHOD — picking an actual payout method
 * is an Accountant-side concern handled in a later part of this workflow,
 * not here.
 */
export function StudentRefundRequestForm({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const submit = useServerFn(initiateRefund);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const payments = useQuery({
    queryKey: ["student-refundable-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, payment_number, amount_paise")
        .eq("student_id", studentId)
        .eq("status", "CAPTURED")
        .or("provider.is.null,provider.neq.simulated")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () =>
      submit({
        data: {
          payment_id: paymentId,
          amount_paise: Math.round(parseFloat(amount) * 100),
          reason,
          mode: "ORIGINAL_METHOD",
        },
      }),
    onSuccess: (out) => {
      toast.success(`Refund request submitted: ${out.refund_number}`);
      qc.invalidateQueries({ queryKey: ["student-refunds", studentId] });
      qc.invalidateQueries({ queryKey: ["student-refundable-payments", studentId] });
      setPaymentId("");
      setAmount("");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit the request"),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
          <IndianRupee className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            Request a Refund
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick the payment you want refunded and tell us why
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <FormField icon={FileText} label="Payment *">
          <Select value={paymentId} onValueChange={setPaymentId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a payment" />
            </SelectTrigger>
            <SelectContent>
              {(payments.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.payment_number} — {formatInr(p.amount_paise)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!payments.isLoading && !(payments.data ?? []).length && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              No captured payments are available to refund right now.
            </p>
          )}
        </FormField>
        <FormField icon={IndianRupee} label="Amount (INR) *" htmlFor="student-refund-amount">
          <Input
            id="student-refund-amount"
            type="number"
            step="0.01"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField icon={MessageSquare} label="Reason *" htmlFor="student-refund-reason">
          <Textarea
            id="student-refund-reason"
            rows={4}
            placeholder="Explain why you're requesting this refund"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your request goes to the <span className="font-semibold text-info">Hostel Admin</span> for
          approval. You&apos;ll be able to track its status below once submitted.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={() => m.mutate()}
        disabled={!paymentId || !amount || !reason || m.isPending}
      >
        <Send className="h-4 w-4" />
        {m.isPending ? "Submitting…" : "Submit request"}
      </Button>
      {!m.isPending && (!paymentId || !amount || !reason) && (
        <p className="text-center text-xs text-destructive">
          {!paymentId
            ? "Choose a payment to refund first."
            : !amount
              ? "Enter the refund amount."
              : "Enter a reason — required before this can be submitted."}
        </p>
      )}
    </div>
  );
}
