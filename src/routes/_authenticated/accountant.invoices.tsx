import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { InvoiceTable } from "@/components/finance/InvoiceTable";
import { InvoiceDetailDialog } from "@/components/finance/InvoiceDetailDialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPropertyInvoices } from "@/lib/finance.functions";
import { useAccountantProperty } from "@/lib/staff-scope";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/accountant/invoices")({
  component: AccInvoicesPage,
});

const STATUS_OPTIONS = [
  "ALL",
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];

function AccInvoicesPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  const fn = useServerFn(listPropertyInvoices);
  const q = useQuery({
    queryKey: ["invoices", propertyId],
    enabled: !!propertyId,
    queryFn: () => fn({ data: { property_id: propertyId! } }),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = q.data ?? [];
    if (status !== "ALL") list = list.filter((r) => r.status === status);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.invoice_number.toLowerCase().includes(term) ||
          (r.students?.full_name ?? "").toLowerCase().includes(term),
      );
    }
    return list;
  }, [q.data, search, status]);

  if (propertyLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Invoices" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!propertyId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" />
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or student"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All statuses" : s.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <InvoiceTable rows={rows} onSelect={(r) => setSelectedId(r.id)} />
      {selectedId && (
        <InvoiceDetailDialog
          invoiceId={selectedId}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
