import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { getErrorMessage } from "@/lib/utils";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { EmptyState } from "@/components/dashboard/EmptyState";

const PAYMENTS_PAGE_SIZE = 20;

/**
 * Resolves the `documents` row the generate-receipt Edge Function writes
 * (owner_type=RECEIPT, owner_id=payment id) and signs a short-lived URL for
 * the private `receipts` storage bucket. Shared by `PaymentHistoryPanel` and
 * `InvoiceDetailDialog` so there's one receipt-download implementation, not
 * two.
 */
export function useReceiptDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const download = useMutation({
    mutationFn: async (paymentId: string) => {
      setDownloadingId(paymentId);
      const { data: doc, error } = await supabase
        .from("documents")
        .select("storage_bucket, storage_path")
        .eq("owner_type", "RECEIPT")
        .eq("owner_id", paymentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!doc) throw new Error("Receipt not generated yet");
      const { data: signed, error: sErr } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);
      if (sErr || !signed) throw new Error(sErr?.message ?? "Could not sign receipt URL");
      return signed.signedUrl;
    },
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
    onError: (e) => toast.error(getErrorMessage(e, "Could not open receipt")),
    onSettled: () => setDownloadingId(null),
  });
  return { downloadingId, download };
}

/**
 * Read-only payment history for a property — separate from PaymentEntryForm
 * (which only records new payments and had no way to see past ones).
 */
export function PaymentHistoryPanel({ propertyId }: { propertyId: string }) {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["payments", propertyId, page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("payments")
        .select(
          "id, payment_number, mode, amount_paise, status, paid_at, students(full_name), invoices(invoice_number)",
          { count: "exact" },
        )
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .range(page * PAYMENTS_PAGE_SIZE, page * PAYMENTS_PAGE_SIZE + PAYMENTS_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const { downloadingId, download } = useReceiptDownload();

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
          <History className="h-4 w-4" />
        </span>
        <h2 className="font-display text-base font-semibold text-foreground">Payment history</h2>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : q.isError ? (
        <p className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Could not load payments."}
        </p>
      ) : !q.data?.rows.length ? (
        <EmptyState
          title="No payments recorded yet"
          description="Your recorded payments will appear here."
        />
      ) : (
        <div className="space-y-2">
          {q.data.rows.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {p.payment_number} · {p.students?.full_name ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.invoices?.invoice_number ?? "—"} · {p.mode} · {p.status}
                  {p.paid_at && ` · ${new Date(p.paid_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-semibold text-foreground">{formatInr(p.amount_paise)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloadingId === p.id}
                  onClick={() => download.mutate(p.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <PaginationBar
            page={page}
            pageSize={PAYMENTS_PAGE_SIZE}
            total={q.data.total}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
