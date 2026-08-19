import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";
import { EmptyState } from "@/components/dashboard/EmptyState";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  student_id: string;
  allocation_id?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  subtotal_paise?: number;
  tax_paise?: number;
  total_paise: number;
  paid_paise: number;
  balance_paise: number;
  notes?: string | null;
  void_reason?: string | null;
  students?: { full_name: string } | null;
}
export type { InvoiceRow };

export function InvoiceTable({
  rows,
  onSelect,
}: {
  rows: InvoiceRow[];
  onSelect?: (row: InvoiceRow) => void;
}) {
  if (!rows.length) {
    return <EmptyState title="No invoices yet" description="Invoices will show up here once generated." />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card-ambient">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/80 bg-card text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">#</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Student</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Due</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Status</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Total</th>
              <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer transition-colors hover:bg-accent/30"
                onClick={() => onSelect?.(r)}
              >
                <td className="px-3 py-3 align-top font-mono text-[11px] text-muted-foreground sm:px-6 sm:py-4 sm:text-xs">
                  {r.invoice_number}
                </td>
                <td className="px-3 py-3 align-top text-xs font-semibold text-foreground sm:px-6 sm:py-4 sm:text-sm">
                  {r.students?.full_name ?? "—"}
                </td>
                <td className="px-3 py-3 align-top text-xs text-muted-foreground sm:px-6 sm:py-4 sm:text-sm">
                  {r.due_date}
                </td>
                <td className="px-3 py-3 align-top sm:px-6 sm:py-4">
                  <InvoiceStatusPill status={r.status as InvoiceStatus} />
                </td>
                <td className="px-3 py-3 text-right align-top text-xs font-semibold text-foreground sm:px-6 sm:py-4 sm:text-sm">
                  {formatInr(r.total_paise)}
                </td>
                <td className="px-3 py-3 text-right align-top text-xs font-semibold text-foreground sm:px-6 sm:py-4 sm:text-sm">
                  {formatInr(r.balance_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 border-t border-border/80 px-3 py-3 sm:flex-row sm:px-6 sm:py-4">
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ReceiptText className="h-4 w-4 shrink-0" aria-hidden="true" />
          Showing 1 to {rows.length} of {rows.length} invoices
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            aria-label="Previous page"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 text-muted-foreground disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-primary text-sm font-semibold text-primary">
            1
          </span>
          <button
            type="button"
            disabled
            aria-label="Next page"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 text-muted-foreground disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-[11px] font-bold tracking-wide shadow-sm",
        INVOICE_STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {status.replaceAll("_", " ")}
    </span>
  );
}
