import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, FileText, IndianRupee, Info, MessageSquare, Send } from "lucide-react";
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

export function RefundRequestForm({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const submit = useServerFn(initiateRefund);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"ORIGINAL_METHOD" | "BANK_TRANSFER" | "CASH" | "OTHER">(
    "ORIGINAL_METHOD",
  );

  const payments = useQuery({
    queryKey: ["captured-payments", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, payment_number, amount_paise, students(full_name)")
        .eq("property_id", propertyId)
        .eq("status", "CAPTURED")
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
          mode,
        },
      }),
    onSuccess: (out) => {
      toast.success(`Refund submitted for approval: ${out.refund_number}`);
      qc.invalidateQueries({ queryKey: ["refunds"] });
      setPaymentId("");
      setAmount("");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
          <IndianRupee className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            Process Refund
          </h2>
          <p className="text-sm text-muted-foreground">Fill the details below to submit a refund request</p>
        </div>
      </div>

      <div className="space-y-4">
        <FormField icon={FileText} label="Payment">
          <Select value={paymentId} onValueChange={setPaymentId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose payment" />
            </SelectTrigger>
            <SelectContent>
              {(payments.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.payment_number} — {p.students?.full_name ?? "—"} — {formatInr(p.amount_paise)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField icon={IndianRupee} label="Amount (INR)" htmlFor="refund-amount">
          <Input
            id="refund-amount"
            type="number"
            step="0.01"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField icon={CreditCard} label="Mode">
          <Select value={mode} onValueChange={(v) => setMode(v as never)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["ORIGINAL_METHOD", "BANK_TRANSFER", "CASH", "OTHER"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField icon={MessageSquare} label="Reason" htmlFor="refund-reason">
          <Textarea
            id="refund-reason"
            rows={3}
            placeholder="Enter reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Refund goes to <span className="font-semibold text-info">pending approval</span> — a
          Hostel Admin (a different user) must approve it before it is processed.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent),0_10px_28px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent),0_14px_36px_-8px_color-mix(in_oklab,var(--primary)_65%,transparent)] active:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_45%,transparent),0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)] disabled:shadow-none"
        onClick={() => m.mutate()}
        disabled={!paymentId || !amount || !reason || m.isPending}
      >
        <Send className="h-4 w-4" />
        {m.isPending ? "Submitting…" : "Submit for approval"}
      </Button>
    </div>
  );
}
