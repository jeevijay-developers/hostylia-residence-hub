import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Ban,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Loader,
  RefreshCw,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { PaymentHistoryPanel } from "@/components/finance/PaymentHistoryPanel";
import { RefundHistoryPanel } from "@/components/finance/RefundHistoryPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInr } from "@/lib/finance";
import {
  avatarTone,
  fullDate,
  humanize,
  initials,
  usePropertyTransactions,
  type FinanceTransaction,
} from "@/lib/property-finance";
import { cn } from "@/lib/utils";

type Pill = { label: string; icon: LucideIcon; className: string };

const SUCCESS = "bg-success/10 text-success";
const WARNING = "bg-warning/10 text-warning";
const INFO = "bg-info/10 text-info";
const DANGER = "bg-destructive/10 text-destructive";
const MUTED = "bg-muted text-muted-foreground";

const PAYMENT_PILL: Record<string, Pill> = {
  CAPTURED: { label: "Paid", icon: CircleCheck, className: SUCCESS },
  CREATED: { label: "Pending", icon: Clock, className: WARNING },
  PENDING: { label: "Pending", icon: Clock, className: WARNING },
  AUTHORIZED: { label: "Authorized", icon: ShieldCheck, className: INFO },
  FAILED: { label: "Failed", icon: CircleX, className: DANGER },
  CANCELLED: { label: "Cancelled", icon: Ban, className: MUTED },
  PARTIALLY_REFUNDED: { label: "Part refunded", icon: Undo2, className: WARNING },
  REFUNDED: { label: "Refunded", icon: Undo2, className: MUTED },
};

const REFUND_PILL: Record<string, Pill> = {
  PENDING_VERIFICATION: { label: "Verifying", icon: Clock, className: WARNING },
  PENDING_APPROVAL: { label: "Awaiting approval", icon: Clock, className: WARNING },
  APPROVED: { label: "Approved", icon: ShieldCheck, className: INFO },
  PROCESSING: { label: "Processing", icon: Loader, className: INFO },
  COMPLETED: { label: "Processed", icon: CircleCheck, className: SUCCESS },
  REJECTED: { label: "Rejected", icon: CircleX, className: DANGER },
  FAILED: { label: "Failed", icon: CircleX, className: DANGER },
  CANCELLED: { label: "Cancelled", icon: Ban, className: MUTED },
};

function StatusPill({ tx }: { tx: FinanceTransaction }) {
  const p = (tx.kind === "REFUND" ? REFUND_PILL : PAYMENT_PILL)[tx.status] ?? {
    label: humanize(tx.status),
    icon: Clock,
    className: MUTED,
  };
  const Icon = p.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        p.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {p.label}
    </span>
  );
}

/**
 * The property's latest payments and refund requests, merged newest first.
 * "View all" opens the full, paged payment history and refund history.
 */
export function RecentTransactionsCard({ propertyId }: { propertyId: string }) {
  const q = usePropertyTransactions(propertyId);
  const rows = q.data ?? [];
  const [allOpen, setAllOpen] = useState(false);

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <RefreshCw className="h-5 w-5 text-primary" aria-hidden="true" />
          Recent transactions
        </CardTitle>
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : q.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load recent transactions. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => q.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <RefreshCw className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">No transactions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Payments and refunds for this property will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open resident</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.key}>
                    <TableCell className="whitespace-nowrap font-medium text-foreground">
                      {t.number}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: t.studentId }}
                        className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary"
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                            avatarTone(t.studentId),
                          )}
                          aria-hidden="true"
                        >
                          {initials(t.name)}
                        </span>
                        <span className="max-w-[150px] truncate">{t.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[160px] truncate text-foreground" title={t.type}>
                        {t.type}
                      </span>
                      {t.method ? (
                        <span className="block text-xs text-muted-foreground">{t.method}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {t.kind === "REFUND" ? (
                        <span className="text-muted-foreground">−{formatInr(t.amountPaise)}</span>
                      ) : (
                        <span className="text-foreground">{formatInr(t.amountPaise)}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fullDate(t.at)}
                    </TableCell>
                    <TableCell>
                      <StatusPill tx={t} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: t.studentId }}
                        aria-label={`Open ${t.name}`}
                        className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>All transactions</DialogTitle>
            <DialogDescription>
              Every payment and refund request for this property.
            </DialogDescription>
          </DialogHeader>
          {allOpen ? (
            <Tabs defaultValue="payments" className="min-w-0">
              <TabsList>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="refunds">Refunds</TabsTrigger>
              </TabsList>
              <TabsContent value="payments" className="mt-3">
                <PaymentHistoryPanel propertyId={propertyId} />
              </TabsContent>
              <TabsContent value="refunds" className="mt-3">
                <RefundHistoryPanel propertyId={propertyId} />
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
