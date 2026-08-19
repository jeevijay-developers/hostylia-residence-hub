import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { InvoiceTable } from "@/components/finance/InvoiceTable";
import { InvoiceDetailDialog } from "@/components/finance/InvoiceDetailDialog";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
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

const INVOICES_PAGE_SIZE = 20;

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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["invoices", propertyId, status, search, page],
    enabled: !!propertyId,
    queryFn: () =>
      fn({
        data: {
          property_id: propertyId!,
          status: status === "ALL" ? undefined : status,
          search: search.trim() || undefined,
          page,
          pageSize: INVOICES_PAGE_SIZE,
        },
      }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  if (propertyLoading) {
    return (
      <div className="space-y-4">
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
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or student"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
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
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Could not load invoices."}
        </p>
      ) : (
        <>
          <InvoiceTable rows={rows} onSelect={(r) => setSelectedId(r.id)} />
          {total > 0 && (
            <PaginationBar
              page={page}
              pageSize={INVOICES_PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
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
