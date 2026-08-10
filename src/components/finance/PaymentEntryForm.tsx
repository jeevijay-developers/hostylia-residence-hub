import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { recordManualPayment } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";

const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

export function PaymentEntryForm({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const record = useServerFn(recordManualPayment);
  const [invoiceId, setInvoiceId] = useState("");
  const [mode, setMode] = useState<"CASH"|"CHEQUE"|"BANK_TRANSFER"|"UPI"|"OTHER">("CASH");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [notes, setNotes] = useState("");

  const openInvoices = useQuery({
    queryKey: ["open-invoices", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, balance_paise, students(full_name)")
        .eq("property_id", propertyId)
        .in("status", PAYABLE_STATUSES)
        .gt("balance_paise", 0)
        .is("deleted_at", null)
        .order("due_date");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Another payment (this form, another tab, Razorpay) can settle/void an
  // invoice while this dropdown sits open — keep it live instead of relying
  // on a manual refresh, so a stale entry can't be picked in the first place.
  useEffect(() => {
    const channel = supabase
      .channel(`payment-entry-invoices-${propertyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `property_id=eq.${propertyId}` },
        () => qc.invalidateQueries({ queryKey: ["open-invoices", propertyId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, qc]);

  const m = useMutation({
    mutationFn: async () => {
      // Belt-and-braces: re-verify the selected invoice's real backend
      // status/balance right before submitting, in case the dropdown (even
      // with the realtime subscription above) is momentarily stale. The
      // atomic record_manual_payment() DB function is still the actual
      // authority and re-checks this itself under a row lock — this is
      // just an earlier, clearer rejection than waiting for that error.
      const { data: fresh, error: fErr } = await supabase
        .from("invoices")
        .select("status, balance_paise")
        .eq("id", invoiceId)
        .single();
      if (fErr || !fresh) throw new Error("Invoice not found");
      if (!PAYABLE_STATUSES.includes(fresh.status) || fresh.balance_paise <= 0) {
        qc.invalidateQueries({ queryKey: ["open-invoices", propertyId] });
        setInvoiceId("");
        throw new Error(`Cannot record a payment against a ${fresh.status.toLowerCase()} invoice`);
      }

      return record({
        data: {
          invoice_id: invoiceId,
          mode,
          amount_paise: Math.round(parseFloat(amount) * 100),
          offline_reference: ref,
          cheque_date: mode === "CHEQUE" ? chequeDate : "",
          notes,
        },
      });
    },
    onSuccess: (out) => {
      toast.success(`Payment recorded: ${out.payment_number}`);
      qc.invalidateQueries({ queryKey: ["open-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setAmount(""); setRef(""); setNotes(""); setInvoiceId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div>
        <Label>Invoice</Label>
        <Select value={invoiceId} onValueChange={setInvoiceId}>
          <SelectTrigger><SelectValue placeholder="Choose invoice" /></SelectTrigger>
          <SelectContent>
            {(openInvoices.data ?? []).map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.invoice_number} — {i.students?.full_name ?? "—"} — {formatInr(i.balance_paise)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["CASH","CHEQUE","BANK_TRANSFER","UPI","OTHER"].map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Amount (INR)</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Reference</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Cheque no. / UPI ref" />
        </div>
        {mode === "CHEQUE" && (
          <div>
            <Label>Cheque date</Label>
            <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
          </div>
        )}
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button
        onClick={() => m.mutate()}
        disabled={!invoiceId || !amount || m.isPending}
      >
        {m.isPending ? "Recording…" : "Record payment"}
      </Button>
    </div>
  );
}
