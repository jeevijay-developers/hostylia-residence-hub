import { Badge } from "@/components/ui/badge";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  student_id: string;
  issue_date: string;
  due_date: string;
  status: string;
  total_paise: number;
  paid_paise: number;
  balance_paise: number;
  students?: { full_name: string } | null;
}

export function InvoiceTable({
  rows,
  onSelect,
}: {
  rows: InvoiceRow[];
  onSelect?: (row: InvoiceRow) => void;
}) {
  if (!rows.length) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No invoices yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2">#</th>
            <th className="p-2">Student</th>
            <th className="p-2">Due</th>
            <th className="p-2">Status</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-t border-border hover:bg-muted/30 cursor-pointer"
              onClick={() => onSelect?.(r)}
            >
              <td className="p-2 font-mono text-xs">{r.invoice_number}</td>
              <td className="p-2">{r.students?.full_name ?? "—"}</td>
              <td className="p-2">{r.due_date}</td>
              <td className="p-2">
                <Badge className={INVOICE_STATUS_TONE[r.status as InvoiceStatus] ?? ""}>
                  {r.status}
                </Badge>
              </td>
              <td className="p-2 text-right">{formatInr(r.total_paise)}</td>
              <td className="p-2 text-right font-semibold">{formatInr(r.balance_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
