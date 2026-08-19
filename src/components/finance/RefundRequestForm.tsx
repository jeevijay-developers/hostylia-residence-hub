import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div>
        <Label>Payment</Label>
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
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount (INR)</Label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label>Mode</Label>
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
        </div>
      </div>
      <div>
        <Label>Reason</Label>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Refund goes to PENDING_APPROVAL — a Hostel Admin (different user) must approve.
      </p>
      <Button onClick={() => m.mutate()} disabled={!paymentId || !amount || !reason || m.isPending}>
        {m.isPending ? "Submitting…" : "Submit for approval"}
      </Button>
    </div>
  );
}
