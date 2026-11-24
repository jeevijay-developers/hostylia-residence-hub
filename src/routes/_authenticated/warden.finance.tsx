import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, FileText, HandCoins, ReceiptIndianRupee, Wallet } from "lucide-react";
import { FinanceLandingGrid } from "@/components/finance/FinanceLandingGrid";
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
    label: "Fee Plans",
    desc: "Rent/mess/deposit templates",
    cta: "Manage plans",
    icon: ReceiptIndianRupee,
    tone: "warning",
    module: "fee_plans_view",
  },
  {
    to: "/warden/invoices",
    label: "Invoices",
    desc: "All invoices for this property",
    cta: "View invoices",
    icon: FileText,
    tone: "info",
    module: "invoices_view",
  },
  {
    to: "/warden/payments",
    label: "Record Payment",
    desc: "Cash, cheque, bank transfer or UPI",
    cta: "Add payment",
    icon: Wallet,
    tone: "success",
    module: "payments_view",
  },
  {
    to: "/warden/revenue",
    label: "Revenue & Collections",
    desc: "Collections + aging summary",
    cta: "View reports",
    icon: BarChart3,
    tone: "primary",
    module: "invoices_view",
  },
  {
    to: "/warden/refunds",
    label: "Refunds",
    desc: "Submit a refund for approval",
    cta: "Submit refund",
    icon: HandCoins,
    tone: "destructive",
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

  return <FinanceLandingGrid items={visible} />;
}
