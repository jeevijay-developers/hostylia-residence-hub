import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, FileText, ReceiptIndianRupee, Wallet } from "lucide-react";
import {
  FinanceLandingGrid,
  type FinanceLandingItem,
} from "@/components/finance/FinanceLandingGrid";

export const Route = createFileRoute("/_authenticated/admin/finance/")({
  component: FinanceIndex,
});

const LINKS: readonly FinanceLandingItem[] = [
  {
    to: "/admin/finance/fee-plans",
    label: "Fee Plans",
    desc: "Rent/mess/deposit templates",
    cta: "Manage plans",
    icon: ReceiptIndianRupee,
    tone: "warning",
  },
  {
    to: "/admin/finance/invoices",
    label: "Invoices",
    desc: "All invoices for this property",
    cta: "View invoices",
    icon: FileText,
    tone: "info",
  },
  {
    to: "/admin/finance/payments",
    label: "Record Payment",
    desc: "Cash, cheque, bank transfer or UPI",
    cta: "Add payment",
    icon: Wallet,
    tone: "success",
  },
  {
    to: "/admin/finance/pnl",
    label: "Revenue & Collections",
    desc: "Collections + aging + refunds",
    cta: "View reports",
    icon: BarChart3,
    tone: "primary",
  },
];

function FinanceIndex() {
  return <FinanceLandingGrid items={LINKS} />;
}
