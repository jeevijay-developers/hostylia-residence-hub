import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, Calendar, CheckCircle2, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder } from "@/lib/finance.functions";
import { formatInr, type InvoiceStatus } from "@/lib/finance";
import { useKycComplete } from "@/lib/kyc";
import { KycGateNotice } from "@/components/students/KycGateNotice";
import { WaveMark } from "@/components/parent/WaveMark";

const STATUS_ICON: Record<InvoiceStatus, typeof CheckCircle2 | null> = {
  DRAFT: null,
  ISSUED: null,
  PARTIALLY_PAID: null,
  PAID: CheckCircle2,
  OVERDUE: AlertCircle,
  VOID: null,
  PARTIALLY_REFUNDED: null,
  REFUNDED: null,
};

const STATUS_BADGE_VARIANT: Record<InvoiceStatus, BadgeProps["variant"]> = {
  DRAFT: "secondary",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  VOID: "secondary",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "secondary",
};

/**
 * Parent-facing invoice list — a restyled, read-mostly presentation of the
 * same invoice data `finance/StudentFeesList` renders for the student view.
 * Kept as its own component (instead of editing the shared one) so this
 * visual pass stays scoped to the Parent portal and doesn't touch the
 * student Fees screen. Same query, same Razorpay mutation, same KYC gate.
 */
export function InvoiceList({
  studentId,
  canPay = true,
}: {
  studentId: string;
  /** Hides "Pay now" for view-only parents — RLS blocks the payment_orders insert either way. */
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
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Payment unavailable — Razorpay keys not configured.",
      ),
  });

  if (q.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );

  const rows = q.data ?? [];
  if (!rows.length) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Fees invoiced for your child will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {!kycComplete && <KycGateNotice message="Complete your KYC to pay your fees online." />}
      {rows.map((i) => {
        const status = i.status as InvoiceStatus;
        const StatusIcon = STATUS_ICON[status];
        return (
          <Card
            key={i.id}
            className="relative overflow-hidden rounded-2xl border-info/20 bg-gradient-to-br from-info/5 via-card to-card shadow-card-ambient"
          >
            <WaveMark className="pointer-events-none absolute -bottom-4 -right-4 h-28 w-40 text-info/10" />
            <CardContent className="relative p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <Badge variant="info" className="rounded-full text-[11px] font-medium">
                      Invoice
                    </Badge>
                    <p className="mt-1.5 truncate font-display text-base font-semibold text-foreground sm:text-lg">
                      {i.invoice_number}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      Due {i.due_date}
                      <span className="text-muted-foreground/40">|</span>
                      <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </p>
                  </div>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>

              <div className="relative mt-4 flex items-end justify-between gap-3">
                <Badge
                  variant={STATUS_BADGE_VARIANT[status]}
                  className="gap-1 rounded-full px-3 py-1 text-xs"
                >
                  {StatusIcon && <StatusIcon className="h-3.5 w-3.5" />}
                  {status}
                </Badge>
                <div className="text-right">
                  <p className="font-display text-2xl font-semibold text-foreground">
                    {formatInr(i.balance_paise)}
                  </p>
                  <p className="text-xs text-muted-foreground">of {formatInr(i.total_paise)}</p>
                </div>
              </div>

              {canPay && i.balance_paise > 0 && status !== "VOID" && (
                <Button
                  size="sm"
                  className="relative mt-4 w-full rounded-full"
                  onClick={() => pay.mutate(i.id)}
                  disabled={!kycComplete || pay.isPending}
                >
                  {pay.isPending ? "Opening…" : "Pay now"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

async function openRazorpayCheckout(order: {
  order_id: string;
  key_id: string;
  amount_paise: number;
  currency: string;
}) {
  if (!window.Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.head.appendChild(s);
    });
  }
  const RazorpayCtor = window.Razorpay;
  if (!RazorpayCtor) throw new Error("Failed to load Razorpay");
  const rzp = new RazorpayCtor({
    key: order.key_id,
    amount: order.amount_paise,
    currency: order.currency,
    order_id: order.order_id,
    name: "Hostylia",
    description: "Hostel fees",
  });
  rzp.open();
}
