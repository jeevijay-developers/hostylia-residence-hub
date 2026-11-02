import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, DoorOpen, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { initiateRefund } from "@/lib/finance.functions";
import { moveOutAllocation, previewMoveOut } from "@/lib/student.functions";

// Statuses complete_move_out() accepts. Pending allocations never had a stay
// to end — they are cancelled, not moved out.
const MOVABLE_STATUSES = ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION"];
const PENDING_STATUSES = ["PENDING_PAYMENT", "PENDING_AGREEMENT"];

// The app is India-only; "today" for move-out dates is the Indian calendar day
// (the same basis the move-out RPC validates against).
function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

interface MoveOutWizardProps {
  studentId: string;
  /** Which panel's student page the Back / completion links return to. */
  area: "admin" | "warden";
  /** Whether the signed-in staff member may start a deposit refund (Admin always;
   * Warden only with the finance "refunds" grant). RLS still enforces it. */
  canInitiateRefund: boolean;
}

/**
 * The single move-out wizard, shared by the Admin route and the Warden route
 * (staff with allocations_edit). Completion goes through the secured
 * complete_move_out() RPC; this component never touches allocation, bed,
 * invoice or ledger rows directly.
 */
export function MoveOutWizard({ studentId, area, canInitiateRefund }: MoveOutWizardProps) {
  const qc = useQueryClient();
  const [actualEnd, setActualEnd] = useState<string>(todayIst());
  const [completedAllocationId, setCompletedAllocationId] = useState<string | null>(null);

  const studentQ = useQuery({
    queryKey: ["student", studentId, "name"],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("full_name, admission_number")
        .eq("id", studentId)
        .maybeSingle();
      return data;
    },
  });

  const allocQ = useQuery({
    queryKey: ["active-allocation", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select("*")
        .eq("student_id", studentId)
        .in("status", [...MOVABLE_STATUSES, ...PENDING_STATUSES, "CLOSED"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const alloc = allocQ.data ?? null;
  const allocationId = completedAllocationId ?? alloc?.id ?? null;
  const isOpen = !!alloc && MOVABLE_STATUSES.includes(alloc.status);
  const isPending = !!alloc && PENDING_STATUSES.includes(alloc.status);
  const isClosed = !!alloc && alloc.status === "CLOSED";

  const previewFn = useServerFn(previewMoveOut);
  const previewQ = useQuery({
    queryKey: ["moveout-preview", allocationId, completedAllocationId],
    enabled: !!allocationId,
    queryFn: async () => previewFn({ data: { allocation_id: allocationId ?? "" } }),
  });
  const settlement = previewQ.data?.settlement ?? null;
  const earliest = previewQ.data?.earliest_move_out_date ?? null;

  const moveOutFn = useServerFn(moveOutAllocation);
  const mut = useMutation({
    mutationFn: async () => {
      if (!alloc) throw new Error("No active allocation found");
      return moveOutFn({ data: { allocation_id: alloc.id, actual_end_date: actualEnd } });
    },
    onSuccess: () => {
      toast.success("Student moved out — record archived");
      if (alloc) setCompletedAllocationId(alloc.id);
      for (const key of [
        ["active-allocation", studentId],
        ["moveout-preview"],
        ["student", studentId],
        ["student-allocations", studentId],
        ["students-list"],
        ["move-out-notices"],
        ["deposit-ledger"],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const backLink =
    area === "admin" ? (
      <Link to="/admin/students/$id" params={{ id: studentId }}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
    ) : (
      <Link to="/warden/students/$id" params={{ id: studentId }}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
    );

  const dateTooEarly = !!earliest && actualEnd < earliest;
  const dateInFuture = actualEnd > todayIst();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        {backLink}
      </Button>
      <PageHeader
        title="Move out"
        description={
          studentQ.data
            ? `${studentQ.data.full_name} · Admission #${studentQ.data.admission_number}`
            : undefined
        }
      />

      {allocQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !alloc ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active allocation found.
        </p>
      ) : (
        <>
          {alloc.status === "NOTICE_GIVEN" && (
            <Card>
              <CardHeader>
                <CardTitle>Move-out notice</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Info
                  label="Notice given on"
                  value={
                    alloc.notice_given_at
                      ? new Date(alloc.notice_given_at).toLocaleDateString("en-IN")
                      : "—"
                  }
                />
                <Info label="Proposed move-out date" value={alloc.requested_move_out_date ?? "—"} />
                <div className="sm:col-span-2">
                  <Info label="Reason" value={alloc.notice_reason ?? "—"} />
                </div>
                {alloc.notice_remarks && (
                  <div className="sm:col-span-2">
                    <Info label="Remarks" value={alloc.notice_remarks} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isPending && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              This allocation is still awaiting{" "}
              {alloc.status === "PENDING_PAYMENT" ? "payment" : "agreement"} — there is no stay to
              move out of yet.
            </p>
          )}

          {isOpen && (
            <Card>
              <CardHeader>
                <CardTitle>Move-out details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info label="Notice period" value={`${alloc.notice_period_days ?? 0} days`} />
                  <Info label="Lock-in until" value={alloc.lock_in_until ?? "—"} />
                  <Info label="Earliest permissible move-out" value={earliest ?? "…"} />
                  <Info
                    label="Provisional refund"
                    value={formatInr(
                      settlement?.refundable_paise ?? previewQ.data?.provisional_refund_paise ?? 0,
                    )}
                  />
                </div>

                <SettlementTable settlement={settlement} isLoading={previewQ.isLoading} />

                <div>
                  <Label htmlFor="ae">Actual move-out date</Label>
                  <Input
                    id="ae"
                    type="date"
                    value={actualEnd}
                    max={todayIst()}
                    min={alloc.start_date}
                    onChange={(e) => setActualEnd(e.target.value)}
                  />
                  {dateTooEarly && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Earlier than the earliest permissible date ({earliest}) under the notice
                      period / lock-in.
                    </p>
                  )}
                </div>
                <Button
                  className="min-h-11"
                  disabled={mut.isPending || !actualEnd || dateInFuture}
                  onClick={() => mut.mutate()}
                >
                  {mut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <DoorOpen className="h-4 w-4" />
                  )}
                  Confirm move-out & archive
                </Button>
              </CardContent>
            </Card>
          )}

          {isClosed && (
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <CardTitle>Move-out completed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The allocation is closed and the bed has been released.
                  {alloc.actual_end_date ? ` Moved out on ${alloc.actual_end_date}.` : ""}
                </p>
                <SettlementTable settlement={settlement} isLoading={previewQ.isLoading} />
                {settlement && settlement.shortfall_paise > 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    {formatInr(settlement.shortfall_paise)} is still outstanding on the invoices
                    above — the deposit did not cover it.
                  </p>
                )}
                {settlement && settlement.refundable_paise > 0 && (
                  <DepositRefundForm
                    allocationId={alloc.id}
                    refundablePaise={settlement.refundable_paise}
                    payments={previewQ.data?.refund_payments ?? []}
                    canInitiate={canInitiateRefund}
                    onDone={() => {
                      qc.invalidateQueries({ queryKey: ["moveout-preview"] });
                      qc.invalidateQueries({ queryKey: ["deposit-ledger"] });
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SettlementTable({
  settlement,
  isLoading,
}: {
  settlement: {
    deposit_balance_paise: number;
    total_dues_paise: number;
    planned_deduction_paise: number;
    shortfall_paise: number;
    refund_in_flight_paise: number;
    refundable_paise: number;
    invoices: {
      id: string;
      invoice_number: string;
      due_date: string;
      balance_paise: number;
      deduct_paise: number;
    }[];
  } | null;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!settlement) {
    return (
      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        Dues and deposit breakdown is available to staff who can move this student out.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Outstanding invoice</th>
              <th className="px-3 py-2 text-right font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">From deposit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {settlement.invoices.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-muted-foreground">
                  No outstanding invoices.
                </td>
              </tr>
            ) : (
              settlement.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-3 py-2">
                    {inv.invoice_number}
                    <span className="ml-2 text-xs text-muted-foreground">due {inv.due_date}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatInr(inv.balance_paise)}</td>
                  <td className="px-3 py-2 text-right">{formatInr(inv.deduct_paise)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Info
          label="Deposit balance (ledger)"
          value={formatInr(settlement.deposit_balance_paise)}
        />
        <Info label="Total outstanding dues" value={formatInr(settlement.total_dues_paise)} />
        <Info label="Deducted from deposit" value={formatInr(settlement.planned_deduction_paise)} />
        <Info
          label="Still outstanding after deposit"
          value={formatInr(settlement.shortfall_paise)}
        />
        {settlement.refund_in_flight_paise > 0 && (
          <Info label="Refunds in progress" value={formatInr(settlement.refund_in_flight_paise)} />
        )}
        <Info label="Refundable deposit" value={formatInr(settlement.refundable_paise)} />
      </div>
    </div>
  );
}

function DepositRefundForm({
  allocationId,
  refundablePaise,
  payments,
  canInitiate,
  onDone,
}: {
  allocationId: string;
  refundablePaise: number;
  payments: { id: string; payment_number: string; remaining_paise: number }[];
  canInitiate: boolean;
  onDone: () => void;
}) {
  const initiateFn = useServerFn(initiateRefund);
  const usable = payments.filter((p) => p.remaining_paise >= 1);
  const [paymentId, setPaymentId] = useState<string>("");
  const [mode, setMode] = useState<"BANK_TRANSFER" | "CASH" | "ORIGINAL_METHOD" | "OTHER">(
    "BANK_TRANSFER",
  );
  const [reason, setReason] = useState("Security deposit refund at move-out");
  const selected = usable.find((p) => p.id === (paymentId || usable[0]?.id));
  const amount = selected ? Math.min(refundablePaise, selected.remaining_paise) : 0;

  const mut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No payment available for this refund");
      return initiateFn({
        data: {
          payment_id: selected.id,
          amount_paise: amount,
          reason,
          mode,
          allocation_id: allocationId,
          requires_deposit_clearance: true,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Refund ${r.refund_number} submitted for clearance and approval`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start the refund"),
  });

  if (!canInitiate) {
    return (
      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        {formatInr(refundablePaise)} of the deposit is refundable. An Accountant or Admin starts the
        refund; it then needs warden clearance and a different user's approval.
      </p>
    );
  }
  if (usable.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        {formatInr(refundablePaise)} is refundable, but no captured payment with refundable room was
        found for this stay. Start the refund from Finance → Refunds against the original payment.
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">
        Refund deposit — {formatInr(amount)}
        {amount < refundablePaise && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (limited by the selected payment; the rest can be refunded against another payment)
          </span>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Against payment</Label>
          <Select value={selected?.id ?? ""} onValueChange={setPaymentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select payment" />
            </SelectTrigger>
            <SelectContent>
              {usable.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.payment_number} · up to {formatInr(p.remaining_paise)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Refund mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              <SelectItem value="ORIGINAL_METHOD">Original method</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="refund-reason">Reason</Label>
        <Textarea
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
      </div>
      <Button
        disabled={mut.isPending || amount <= 0 || reason.trim().length < 3}
        onClick={() => mut.mutate()}
      >
        {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit refund for approval
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
