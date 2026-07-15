import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InvoiceTable } from "@/components/finance/InvoiceTable";
import { listPropertyInvoices } from "@/lib/finance.functions";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/finance/invoices")({
  component: AdminInvoicesPage,
});

function AdminInvoicesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const fn = useServerFn(listPropertyInvoices);
  const q = useQuery({
    queryKey: ["invoices", propertyId],
    enabled: !!propertyId,
    queryFn: () => fn({ data: { property_id: propertyId! } }),
  });

  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" />
      <InvoiceTable rows={q.data ?? []} />
    </div>
  );
}
