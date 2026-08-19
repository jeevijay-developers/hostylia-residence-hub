import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ChevronRight, FileText, ReceiptIndianRupee, Wallet } from "lucide-react";
import { cn, toneClasses } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/finance/")({
  component: FinanceIndex,
});

const LINKS = [
  {
    to: "/admin/finance/fee-plans",
    label: "Fee plans",
    desc: "Rent/mess/deposit templates",
    icon: ReceiptIndianRupee,
    tone: "primary",
  },
  {
    to: "/admin/finance/invoices",
    label: "Invoices",
    desc: "All invoices for this property",
    icon: FileText,
    tone: "info",
  },
  {
    to: "/admin/finance/payments",
    label: "Record payment",
    desc: "Cash, cheque, bank transfer or UPI",
    icon: Wallet,
    tone: "success",
  },
  {
    to: "/admin/finance/pnl",
    label: "Revenue & Collections",
    desc: "Collections + aging + refunds",
    icon: BarChart3,
    tone: "warning",
  },
] as const;

function FinanceIndex() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <Link
            key={l.to}
            to={l.to}
            className="panel-lift group flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient hover:border-primary/40 sm:p-5"
          >
            <span
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14",
                toneClasses[l.tone],
              )}
            >
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-foreground sm:text-lg">
                {l.label}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{l.desc}</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
