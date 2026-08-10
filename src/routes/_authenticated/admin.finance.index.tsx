import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/finance/")({
  component: FinanceIndex,
});

function FinanceIndex() {
  const links = [
    { to: "/admin/finance/fee-plans", label: "Fee plans", desc: "Rent/mess/deposit templates" },
    { to: "/admin/finance/invoices", label: "Invoices", desc: "All invoices for this property" },
    {
      to: "/admin/finance/payments",
      label: "Record payment",
      desc: "Cash, cheque, bank transfer or UPI",
    },
    {
      to: "/admin/finance/pnl",
      label: "Revenue & Collections",
      desc: "Collections + aging + refunds",
    },
  ] as const;
  return (
    <div className="space-y-6">
      <PageHeader title="Finance" />
      <div className="grid gap-3 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="block">
            <Card className="h-full hover:border-primary/50 transition">
              <CardContent className="p-4">
                <p className="font-semibold">{l.label}</p>
                <p className="text-sm text-muted-foreground">{l.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
