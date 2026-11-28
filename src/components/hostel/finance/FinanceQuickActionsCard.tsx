import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChartColumn,
  FileText,
  IndianRupee,
  Landmark,
  Settings2,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { PaymentEntryForm } from "@/components/finance/PaymentEntryForm";
import { RefundRequestForm } from "@/components/finance/RefundRequestForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const tileClass =
  "flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

function TileBody({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="leading-tight">{children}</span>
    </>
  );
}

/**
 * Shortcuts into the existing finance flows for this property. Record payment
 * and Refund request open the same forms the Finance pages use. Create invoice
 * opens the invoice list with its Create invoice dialog already open
 * (?create=true). The rest go to the Finance pages, which already show this
 * property — the tab makes it the active one.
 */
export function FinanceQuickActionsCard({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"payment" | "refund" | null>(null);

  const close = (open: boolean) => {
    if (open) return;
    setDialog(null);
    // Whatever was recorded or requested shows up in this tab's figures.
    qc.invalidateQueries({ queryKey: ["property-finance", propertyId] });
    qc.invalidateQueries({ queryKey: ["students-tab", propertyId] });
  };

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Quick actions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-3 gap-2.5">
          <button type="button" className={tileClass} onClick={() => setDialog("payment")}>
            <TileBody icon={IndianRupee}>Record payment</TileBody>
          </button>
          <Link
            to="/admin/finance/invoices"
            search={{ create: true }}
            className={tileClass}
            title="Bill a resident — opens the Create invoice form"
          >
            <TileBody icon={FileText}>Create invoice</TileBody>
          </Link>
          <Link
            to="/admin/finance/pnl"
            className={tileClass}
            title="Revenue & collections summary and refund approvals"
          >
            <TileBody icon={Landmark}>Finance overview</TileBody>
          </Link>
          <button type="button" className={tileClass} onClick={() => setDialog("refund")}>
            <TileBody icon={Undo2}>Refund request</TileBody>
          </button>
          <Link to="/admin/finance/fee-plans" className={tileClass} title="Fee plans">
            <TileBody icon={Settings2}>Fee settings</TileBody>
          </Link>
          <Link to="/admin/reports" className={tileClass} title="Collections, aging and more">
            <TileBody icon={ChartColumn}>Reports</TileBody>
          </Link>
        </div>
      </CardContent>

      <Dialog open={dialog === "payment"} onOpenChange={close}>
        <DialogContent className="max-w-2xl p-3 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Record an offline payment against an open invoice.
            </DialogDescription>
          </DialogHeader>
          {dialog === "payment" ? <PaymentEntryForm propertyId={propertyId} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "refund"} onOpenChange={close}>
        <DialogContent className="max-w-2xl p-3 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Refund request</DialogTitle>
            <DialogDescription>
              Request a refund against a captured payment. It goes for approval before it is paid.
            </DialogDescription>
          </DialogHeader>
          {dialog === "refund" ? <RefundRequestForm propertyId={propertyId} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
