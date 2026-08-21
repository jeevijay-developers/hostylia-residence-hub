import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder } from "@/lib/finance.functions";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";
import { useKycComplete } from "@/lib/kyc";
import { KycGateNotice } from "@/components/students/KycGateNotice";

const INVOICE_STATUS_ICON: Record<InvoiceStatus, typeof CheckCircle2 | null> = {
  DRAFT: null,
  ISSUED: null,
  PARTIALLY_PAID: null,
  PAID: CheckCircle2,
  OVERDUE: AlertCircle,
  VOID: null,
  PARTIALLY_REFUNDED: null,
  REFUNDED: null,
};

export function StudentFeesList({
  studentId,
  canPay = true,
}: {
  studentId: string;
  /** Hides the "Pay now" action for Read-tier students — RLS blocks the payment_orders insert either way. */
  canPay?: boolean;
}) {
  const qc = useQueryClient();
  const createOrder = useServerFn(createRazorpayOrder);
  const { complete: kycComplete } = useKycComplete(studentId);

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
    <div className="space-y-3">
      {!kycComplete && <KycGateNotice message="Complete your KYC to pay your fees online." />}
      {rows.map((i) => {
        const StatusIcon = INVOICE_STATUS_ICON[i.status as InvoiceStatus];
        return (
          <div key={i.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <Badge variant="secondary" className="mb-1 text-[11px] font-normal">
                    Invoice
                  </Badge>
                  <p className="font-mono text-sm font-semibold text-foreground">{i.invoice_number}</p>
                  <p className="text-sm text-muted-foreground">Due {i.due_date}</p>
                </div>
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <Badge className={`gap-1 ${INVOICE_STATUS_TONE[i.status as InvoiceStatus] ?? ""}`}>
                {StatusIcon && <StatusIcon className="h-3.5 w-3.5" />}
                {i.status}
              </Badge>
              <div className="text-right">
                <p className="text-xl font-semibold">{formatInr(i.balance_paise)}</p>
                <p className="text-xs text-muted-foreground">of {formatInr(i.total_paise)}</p>
              </div>
            </div>

            {canPay && i.balance_paise > 0 && i.status !== "VOID" && (
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => pay.mutate(i.id)}
                disabled={!kycComplete || pay.isPending}
              >
                {pay.isPending ? "Opening…" : "Pay now"}
              </Button>
            )}
          </div>
        );
      })}
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
