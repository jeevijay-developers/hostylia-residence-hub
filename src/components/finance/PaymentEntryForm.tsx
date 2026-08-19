import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, FileText, IndianRupee, Save, StickyNote } from "lucide-react";
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
import { recordManualPayment } from "@/lib/finance.functions";
import { formatInr } from "@/lib/finance";

const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

export function PaymentEntryForm({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const record = useServerFn(recordManualPayment);
  const [invoiceId, setInvoiceId] = useState("");
  const [mode, setMode] = useState<"CASH" | "CHEQUE" | "BANK_TRANSFER" | "UPI" | "OTHER">("CASH");
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
      setAmount("");
      setRef("");
      setNotes("");
      setInvoiceId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            Record Payment
          </h2>
          <p className="text-sm text-muted-foreground">Enter payment details below</p>
        </div>
      </div>

      <div className="space-y-4">
        <FormField icon={FileText} label="Invoice">
          <Select value={invoiceId} onValueChange={setInvoiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose invoice" />
            </SelectTrigger>
            <SelectContent>
              {(openInvoices.data ?? []).map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.invoice_number} — {i.students?.full_name ?? "—"} — {formatInr(i.balance_paise)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField icon={CreditCard} label="Mode">
          <Select value={mode} onValueChange={(v) => setMode(v as never)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["CASH", "CHEQUE", "BANK_TRANSFER", "UPI", "OTHER"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField icon={IndianRupee} label="Amount (INR)" htmlFor="payment-amount">
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField icon={FileText} label="Reference" htmlFor="payment-reference">
          <Input
            id="payment-reference"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Cheque no. / UPI ref"
          />
        </FormField>
        {mode === "CHEQUE" && (
          <FormField icon={FileText} label="Cheque date" htmlFor="payment-cheque-date">
            <Input
              id="payment-cheque-date"
              type="date"
              value={chequeDate}
              onChange={(e) => setChequeDate(e.target.value)}
            />
          </FormField>
        )}
        <FormField icon={StickyNote} label="Notes" htmlFor="payment-notes">
          <Textarea
            id="payment-notes"
            rows={3}
            placeholder="Add notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>

      <Button
        size="lg"
        className="w-full shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent),0_10px_28px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent),0_14px_36px_-8px_color-mix(in_oklab,var(--primary)_65%,transparent)] active:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_45%,transparent),0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)] disabled:shadow-none"
        onClick={() => m.mutate()}
        disabled={!invoiceId || !amount || m.isPending}
      >
        <Save className="h-4 w-4" />
        {m.isPending ? "Recording…" : "Record payment"}
      </Button>
    </div>
  );
}
