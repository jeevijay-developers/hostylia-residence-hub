import { useQuery } from "@tanstack/react-query";
import { Download, ReceiptText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";
import { useReceiptDownload } from "@/components/finance/PaymentHistoryPanel";

/**
 * Read-only invoice detail — shared by Accountant (and reusable by Admin
 * later without duplication). Fetches the full invoice row (GST fields
 * included) plus its payment history via the existing RLS-scoped client.
 */
export function InvoiceDetailDialog({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const invoiceQ = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, issue_date, due_date, status, subtotal_paise, discount_paise, tax_paise, late_fee_paise, total_paise, paid_paise, refunded_paise, balance_paise, gst_invoice, seller_gstin_snapshot, buyer_gstin_snapshot, notes, students(full_name)",
        )
        .eq("id", invoiceId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["invoice-payments", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, payment_number, mode, amount_paise, status, paid_at")
        .eq("invoice_id", invoiceId)
        .order("paid_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const inv = invoiceQ.data;
  const { downloadingId, download } = useReceiptDownload();

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
              <ReceiptText className="h-5 w-5" />
            </span>
            <DialogTitle className="font-mono text-base">
              {inv?.invoice_number ?? "Invoice"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {invoiceQ.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

        {inv && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{inv.students?.full_name ?? "—"}</span>
              <Badge className={INVOICE_STATUS_TONE[inv.status as InvoiceStatus] ?? ""}>
                {inv.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-muted/20 p-3">
              <Row label="Issue date" value={inv.issue_date} />
              <Row label="Due date" value={inv.due_date} />
              <Row label="Subtotal" value={formatInr(inv.subtotal_paise)} />
              <Row label="Discount" value={formatInr(inv.discount_paise)} />
              <Row label="Tax" value={formatInr(inv.tax_paise)} />
              <Row label="Late fee" value={formatInr(inv.late_fee_paise)} />
              <Row label="Total" value={formatInr(inv.total_paise)} strong />
              <Row label="Paid" value={formatInr(inv.paid_paise)} />
              <Row label="Refunded" value={formatInr(inv.refunded_paise)} />
              <Row label="Balance" value={formatInr(inv.balance_paise)} strong />
            </div>

            {inv.gst_invoice && (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3 text-xs">
                <p className="mb-1 font-medium text-foreground">GST invoice</p>
                <p className="text-muted-foreground">
                  Seller GSTIN: {inv.seller_gstin_snapshot ?? "—"}
                </p>
                <p className="text-muted-foreground">
                  Buyer GSTIN: {inv.buyer_gstin_snapshot ?? "—"}
                </p>
              </div>
            )}

            {inv.notes && <p className="text-xs text-muted-foreground">Notes: {inv.notes}</p>}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Payment history</p>
              {paymentsQ.isLoading && <Skeleton className="h-12 w-full rounded-xl" />}
              {!paymentsQ.isLoading && (paymentsQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
              )}
              {!paymentsQ.isLoading &&
                (paymentsQ.data ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 p-2.5 text-xs"
                  >
                    <span>
                      {p.payment_number} · {p.mode}
                      {p.paid_at && ` · ${new Date(p.paid_at).toLocaleDateString()}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {formatInr(p.amount_paise)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Download receipt"
                        disabled={downloadingId === p.id}
                        onClick={() => download.mutate(p.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</p>
    </div>
  );
}
