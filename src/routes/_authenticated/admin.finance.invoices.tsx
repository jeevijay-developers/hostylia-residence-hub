import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Download, Plus, ReceiptText } from "lucide-react";

import { InvoiceTable, type InvoiceRow } from "@/components/finance/InvoiceTable";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatInr, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/finance";
import { downloadCsv } from "@/lib/csv-export";
import {
  listPropertyInvoices,
  createManualInvoice,
  editInvoice,
  voidInvoice,
} from "@/lib/finance.functions";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/finance/invoices")({
  component: AdminInvoicesPage,
});

const STATUSES = [
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

const INVOICES_PAGE_SIZE = 20;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function monthEndIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function AdminInvoicesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const { data: role } = useResolvedRole();
  const isHostelAdmin = role?.role === "HOSTEL_ADMIN";

  const qc = useQueryClient();
  const listFn = useServerFn(listPropertyInvoices);
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["invoices", propertyId, status, page],
    enabled: !!propertyId,
    queryFn: () =>
      listFn({
        data: {
          property_id: propertyId!,
          status: status === "ALL" ? undefined : status,
          page,
          pageSize: INVOICES_PAGE_SIZE,
        },
      }),
  });
  const rows = (q.data?.rows ?? []) as InvoiceRow[];
  const total = q.data?.total ?? 0;

  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<InvoiceRow | null>(null);

  // CSV export needs every matching invoice, not just the visible page — a
  // separate one-shot fetch (still server-side, RLS-scoped) rather than
  // pulling the full dataset into the paginated view's own query.
  async function exportCsv() {
    if (!propertyId) return;
    setExporting(true);
    try {
      const all = await listFn({
        data: {
          property_id: propertyId,
          status: status === "ALL" ? undefined : status,
          page: 0,
          pageSize: 10000,
        },
      });
      downloadCsv(
        `invoices-${propertyId}-${todayIso()}.csv`,
        [
          "Invoice #",
          "Student",
          "Issue date",
          "Due date",
          "Status",
          "Total (INR)",
          "Paid (INR)",
          "Balance (INR)",
        ],
        (all.rows as InvoiceRow[]).map((r) => [
          r.invoice_number,
          r.students?.full_name ?? "",
          r.issue_date,
          r.due_date,
          r.status,
          (r.total_paise / 100).toFixed(2),
          (r.paid_paise / 100).toFixed(2),
          (r.balance_paise / 100).toFixed(2),
        ]),
      );
    } finally {
      setExporting(false);
    }
  }

  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Choose a property first.
      </p>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={total === 0 || exporting}
            >
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            {isHostelAdmin && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create invoice
              </Button>
            )}
          </div>
        }
      />

      <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          setPage(0);
        }}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : q.isError ? (
        <p className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Could not load invoices."}
        </p>
      ) : (
        <>
          <InvoiceTable rows={rows} onSelect={isHostelAdmin ? setDetailRow : undefined} />
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

      {isHostelAdmin && (
        <CreateInvoiceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          propertyId={propertyId}
          onCreated={() => qc.invalidateQueries({ queryKey: ["invoices", propertyId] })}
        />
      )}

      {isHostelAdmin && (
        <InvoiceDetailDialog
          row={detailRow}
          onOpenChange={(v) => !v && setDetailRow(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["invoices", propertyId] });
            setDetailRow(null);
          }}
        />
      )}
    </div>
  );
}

interface EligibleAllocation {
  id: string;
  billing_cycle_day: number | null;
  fee_plan_id: string | null;
  students: { full_name: string; admission_number: string } | null;
  fee_plans: { name: string; due_day: number; grace_period_days: number } | null;
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createManualInvoice);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allocationId, setAllocationId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStartIso());
  const [periodEnd, setPeriodEnd] = useState(monthEndIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [notes, setNotes] = useState("");

  const allocationsQ = useQuery({
    queryKey: ["invoice-eligible-allocations", propertyId],
    enabled: open,
    queryFn: async (): Promise<EligibleAllocation[]> => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, billing_cycle_day, fee_plan_id, students(full_name, admission_number), fee_plans(name, due_day, grace_period_days)",
        )
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .not("fee_plan_id", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EligibleAllocation[];
    },
  });
  const allocations = allocationsQ.data ?? [];
  const selected = allocations.find((a) => a.id === allocationId) ?? null;

  function applyDefaults(a: EligibleAllocation) {
    setAllocationId(a.id);
    setPeriodStart(monthStartIso());
    setPeriodEnd(monthEndIso());
    const grace = a.fee_plans?.grace_period_days ?? 0;
    const d = new Date();
    d.setDate(d.getDate() + grace);
    setDueDate(d.toISOString().slice(0, 10));
  }

  function reset() {
    setAllocationId("");
    setPeriodStart(monthStartIso());
    setPeriodEnd(monthEndIso());
    setDueDate(todayIso());
    setNotes("");
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!allocationId) throw new Error("Pick a student allocation");
      return createFn({
        data: {
          allocation_id: allocationId,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          due_date: dueDate,
          notes: notes || undefined,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Invoice ${r.invoice_number} created`);
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create invoice"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
              <Plus className="h-5 w-5" />
            </span>
            <DialogTitle>Create invoice</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Student / allocation</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selected
                    ? `${selected.students?.full_name ?? "—"} · ${selected.fee_plans?.name ?? "—"}`
                    : "Choose an active allocation"}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search student…" />
                  <CommandList>
                    <CommandEmpty>No active allocations with a fee plan.</CommandEmpty>
                    <CommandGroup>
                      {allocations.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={`${a.students?.full_name ?? ""} ${a.students?.admission_number ?? ""}`}
                          onSelect={() => {
                            applyDefaults(a);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              allocationId === a.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">
                            {a.students?.full_name} ({a.students?.admission_number}) ·{" "}
                            {a.fee_plans?.name}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inv-period-start">Billing period start</Label>
              <Input
                id="inv-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inv-period-end">Billing period end</Label>
              <Input
                id="inv-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="inv-due">Due date</Label>
            <Input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          <p className="rounded-xl border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
            Total is computed from the allocation's fee plan components — the same rollup the
            automated monthly generator uses. A duplicate for the same allocation + billing period
            is rejected.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!allocationId || create.isPending}>
            {create.isPending ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({
  row,
  onOpenChange,
  onChanged,
}: {
  row: InvoiceRow | null;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const editFn = useServerFn(editInvoice);
  const voidFn = useServerFn(voidInvoice);
  const [dueDate, setDueDate] = useState(row?.due_date ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [voidReason, setVoidReason] = useState("");
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const editable = !!row && !["VOID", "REFUNDED"].includes(row.status);

  const edit = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No invoice selected");
      return editFn({ data: { invoice_id: row.id, due_date: dueDate, notes: notes || undefined } });
    },
    onSuccess: () => {
      toast.success("Invoice updated");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const doVoid = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No invoice selected");
      if (voidReason.trim().length < 3) throw new Error("Reason is required");
      return voidFn({ data: { invoice_id: row.id, reason: voidReason.trim() } });
    },
    onSuccess: () => {
      toast.success("Invoice voided");
      setConfirmingVoid(false);
      setVoidReason("");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  return (
    <Dialog key={row?.id ?? "none"} open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
              <ReceiptText className="h-5 w-5" />
            </span>
            <DialogTitle className="font-mono">{row?.invoice_number}</DialogTitle>
          </div>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={INVOICE_STATUS_TONE[row.status as InvoiceStatus] ?? ""}>
                {row.status}
              </Badge>
              <span className="text-muted-foreground">{row.students?.full_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border/80 bg-muted/20 p-3 text-muted-foreground">
              <span>Subtotal</span>
              <span className="text-right text-foreground">{formatInr(row.subtotal_paise)}</span>
              <span>Tax</span>
              <span className="text-right text-foreground">{formatInr(row.tax_paise)}</span>
              <span>Total</span>
              <span className="text-right font-semibold text-foreground">
                {formatInr(row.total_paise)}
              </span>
              <span>Paid</span>
              <span className="text-right text-foreground">{formatInr(row.paid_paise)}</span>
              <span>Balance</span>
              <span className="text-right text-foreground">{formatInr(row.balance_paise)}</span>
            </div>

            {editable ? (
              <div className="space-y-3 border-t border-border/80 pt-3">
                <div>
                  <Label htmlFor="edit-due">Due date</Label>
                  <Input
                    id="edit-due"
                    type="date"
                    defaultValue={row.due_date}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    defaultValue={row.notes ?? ""}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Amounts can't be edited once an invoice is issued — void and create a corrected
                  invoice instead.
                </p>
                <Button
                  size="sm"
                  onClick={() => edit.mutate()}
                  disabled={edit.isPending || !dueDate}
                >
                  Save changes
                </Button>
              </div>
            ) : (
              <p className="border-t border-border/80 pt-3 text-xs text-muted-foreground">
                {row.status === "VOID" && row.void_reason
                  ? `Voided: ${row.void_reason}`
                  : "This invoice can no longer be edited."}
              </p>
            )}

            {editable && (
              <div className="space-y-2 border-t border-border/80 pt-3">
                {!confirmingVoid ? (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmingVoid(true)}>
                    Delete invoice
                  </Button>
                ) : (
                  <>
                    <Label htmlFor="void-reason">Reason (required)</Label>
                    <Textarea
                      id="void-reason"
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      rows={2}
                      placeholder="Why is this invoice being deleted?"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => doVoid.mutate()}
                        disabled={doVoid.isPending}
                      >
                        Confirm delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingVoid(false)}>
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Issued invoices are financial records and are never hard-deleted — this voids
                      the invoice (audited, reversible in effect via reissue) rather than erasing
                      it.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
