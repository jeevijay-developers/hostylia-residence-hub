import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder } from "@/lib/finance.functions";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";

export function StudentFeesList({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const createOrder = useServerFn(createRazorpayOrder);

  const q = useQuery({
    queryKey: ["student-invoices", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, due_date, status, total_paise, balance_paise")
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const pay = useMutation({
    mutationFn: async (invoiceId: string) => createOrder({ data: { invoice_id: invoiceId } }),
    onSuccess: (out) => {
      // Open Razorpay checkout. Requires window.Razorpay script — loaded on demand.
      openRazorpayCheckout(out).catch((e) => toast.error(e.message));
      qc.invalidateQueries({ queryKey: ["student-invoices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Payment unavailable — Razorpay keys not configured."),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No invoices yet.</p>;

  return (
    <div className="space-y-2">
      {rows.map((i) => (
        <div key={i.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs">{i.invoice_number}</p>
              <p className="text-sm">Due {i.due_date}</p>
              <Badge className={INVOICE_STATUS_TONE[i.status as InvoiceStatus] ?? ""}>{i.status}</Badge>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{formatInr(i.balance_paise)}</p>
              <p className="text-xs text-muted-foreground">of {formatInr(i.total_paise)}</p>
              {i.balance_paise > 0 && i.status !== "VOID" && (
                <Button size="sm" className="mt-2"
                  onClick={() => pay.mutate(i.id)}
                  disabled={pay.isPending}>
                  {pay.isPending ? "Opening…" : "Pay now"}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function openRazorpayCheckout(order: {
  order_id: string; key_id: string; amount_paise: number; currency: string;
}) {
  if (!(window as any).Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.head.appendChild(s);
    });
  }
  const rzp = new (window as any).Razorpay({
    key: order.key_id,
    amount: order.amount_paise,
    currency: order.currency,
    order_id: order.order_id,
    name: "Hostylia",
    description: "Hostel fees",
  });
  rzp.open();
}
