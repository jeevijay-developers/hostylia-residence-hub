import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronRight,
  FileText,
  HandCoins,
  ReceiptIndianRupee,
  Wallet,
} from "lucide-react";
import { cn, toneClasses } from "@/lib/utils";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/finance")({
  head: () => ({ meta: [{ title: "Finance — Hostylia" }] }),
  component: WardenFinancePage,
});

/**
 * Same card-grid structure as Admin's Finance landing
 * (admin.finance.index.tsx) — Fee plans / Invoices / Record payment /
 * Revenue & Collections — plus a 5th "Refunds" card, shown only when the
 * Warden's own refund-submission workflow (/warden/refunds) is permitted.
 * Each card reuses an existing Warden route; nothing here duplicates a
 * page, component or data query. Visibility is per-card, each gated on the
 * exact permission key its destination route itself enforces — not an
 * all-or-nothing page guard — so Admin can grant any subset.
 */
const LINKS = [
  {
    to: "/warden/fee-plans",
    label: "Fee plans",
    desc: "Rent/mess/deposit templates",
    icon: ReceiptIndianRupee,
    tone: "primary",
    module: "fee_plans_view",
  },
  {
    to: "/warden/invoices",
    label: "Invoices",
    desc: "All invoices for this property",
    icon: FileText,
    tone: "info",
    module: "invoices_view",
  },
  {
    to: "/warden/payments",
    label: "Record payment",
    desc: "Cash, cheque, bank transfer or UPI",
    icon: Wallet,
    tone: "success",
    module: "payments_view",
  },
  {
    to: "/warden/revenue",
    label: "Revenue & Collections",
    desc: "Collections + aging summary",
    icon: BarChart3,
    tone: "warning",
    module: "invoices_view",
  },
  {
    to: "/warden/refunds",
    label: "Refunds",
    desc: "Submit a refund for approval",
    icon: HandCoins,
    tone: "primary",
    module: "refunds",
  },
] as const;

function WardenFinancePage() {
  const { can, isLoading } = useWardenPermissions();
  if (isLoading) return null;

  const visible = LINKS.filter((l) => can(l.module));

  if (visible.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Access denied — you don't have permission to view any Finance module. Ask your Hostel Admin
        to grant access under Customize Permissions.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((l) => {
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
