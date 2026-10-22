import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  FileMinus,
  Info,
  PiggyBank,
  ReceiptText,
  RotateCcw,
  Wallet,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { ExportButton } from "@/components/reports/ExportButton";
import { supabase } from "@/integrations/supabase/client";
import { previewMoveOut } from "@/lib/student.functions";
import { formatInr } from "@/lib/finance";
import { cn, type SemanticTone } from "@/lib/utils";
import type { CsvColumn } from "@/lib/csv";

const PAGE_SIZE = 10;

type EntryType =
  | "DEPOSIT_CHARGED"
  | "DEPOSIT_RECEIVED"
  | "DEDUCTION"
  | "ADJUSTMENT"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED"
  | "REVERSAL";

type LedgerEntry = {
  id: string;
  entry_type: EntryType;
  direction: "CREDIT" | "DEBIT";
  amount_paise: number;
  description: string | null;
  created_at: string;
  allocation_id: string;
};

type RowWithBalance = LedgerEntry & { balance_paise: number };

type FilterTab = "ALL" | "DEPOSIT" | "DEDUCTION" | "REFUND";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "ALL", label: "All Transactions" },
  { value: "DEPOSIT", label: "Deposits" },
  { value: "DEDUCTION", label: "Deductions" },
  { value: "REFUND", label: "Refunds" },
];

/** Solid, high-contrast icon-badge fills — same convention as the Warden
 * daily-brief's KPI tiles (bg-<tone> + <tone>-foreground). */
const SOLID_TONE_CLASSES: Record<SemanticTone, string> = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  muted: "bg-muted text-muted-foreground",
};

function categoryOf(entryType: EntryType): FilterTab | "OTHER" {
  if (entryType === "DEPOSIT_CHARGED" || entryType === "DEPOSIT_RECEIVED") return "DEPOSIT";
  if (entryType === "DEDUCTION") return "DEDUCTION";
  if (entryType === "REFUND_INITIATED" || entryType === "REFUND_COMPLETED") return "REFUND";
  return "OTHER"; // ADJUSTMENT / REVERSAL — shown under "All Transactions" only
}

function typeMeta(entryType: EntryType): {
  label: string;
  variant: "success" | "warning" | "info" | "secondary" | "destructive";
} {
  switch (entryType) {
    case "DEPOSIT_CHARGED":
    case "DEPOSIT_RECEIVED":
      return { label: "Deposit", variant: "success" };
    case "DEDUCTION":
      return { label: "Deduction", variant: "warning" };
    case "REFUND_INITIATED":
    case "REFUND_COMPLETED":
      return { label: "Refund", variant: "info" };
    case "REVERSAL":
      return { label: "Reversal", variant: "destructive" };
    default:
      return { label: "Adjustment", variant: "secondary" };
  }
}

function statusMeta(entryType: EntryType): {
  label: string;
  variant: "success" | "warning" | "secondary";
} {
  // Every ledger row already represents a finalized movement except an
  // initiated-but-not-yet-paid-out refund, which is still in flight.
  if (entryType === "REFUND_INITIATED") return { label: "Processing", variant: "warning" };
  if (entryType === "REVERSAL") return { label: "Reversed", variant: "secondary" };
  return { label: "Completed", variant: "success" };
}

/** Short, honest reference derived from the entry's own allocation_id (the
 * only identifier every ledger row actually carries — reference_id is not
 * populated by the current write paths) — not a fabricated document number. */
function referenceOf(allocationId: string): string {
  return `ALLOC-${allocationId.replace(/-/g, "").slice(-6).toUpperCase()}`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface StudentOption {
  id: string;
  full_name: string;
  admission_number: string;
  email: string | null;
  status: string;
  allocations: { id: string; status: string; rooms: { room_number: string } | null }[] | null;
}

/**
 * Read-only finance view of a student's deposit ledger + provisional
 * move-out refund — reuses `previewMoveOut` (already used by the Admin
 * move-out wizard) and the existing `dep_ledger_staff_read` RLS policy
 * (already grants ACCOUNTANT via is_finance_staff). Does NOT expose the
 * move-out action itself, or any deposit/refund mutation — those stay
 * Admin/property-management operations, out of Accountant scope here.
 */
export function DepositLedgerPanel({ propertyId }: { propertyId: string }) {
  const [studentId, setStudentId] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [page, setPage] = useState(0);

  const students = useQuery({
    queryKey: ["finance-students", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_number, email, status, allocations(id, status, rooms(room_number))",
        )
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentOption[];
    },
  });

  const selectedStudent = students.data?.find((s) => s.id === studentId) ?? null;
  const activeAllocation = selectedStudent?.allocations?.find((a) => a.status === "ACTIVE") ?? null;
  const activeAllocationId = activeAllocation?.id ?? null;

  const ledgerQ = useQuery({
    queryKey: ["deposit-ledger", activeAllocationId],
    enabled: !!activeAllocationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_ledger_entries")
        .select("id, entry_type, direction, amount_paise, description, created_at, allocation_id")
        .eq("allocation_id", activeAllocationId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as LedgerEntry[];
    },
  });

  const previewFn = useServerFn(previewMoveOut);
  const previewQ = useQuery({
    queryKey: ["moveout-preview", activeAllocationId],
    enabled: !!activeAllocationId,
    queryFn: () => previewFn({ data: { allocation_id: activeAllocationId! } }),
  });

  const entries = useMemo(() => ledgerQ.data ?? [], [ledgerQ.data]);

  const availableBalance = entries.reduce(
    (sum, e) => sum + (e.direction === "CREDIT" ? e.amount_paise : -e.amount_paise),
    0,
  );
  const totalDeductions = entries
    .filter((e) => e.entry_type === "DEDUCTION")
    .reduce((sum, e) => sum + e.amount_paise, 0);
  const refunded = entries
    .filter((e) => e.entry_type === "REFUND_COMPLETED")
    .reduce((sum, e) => sum + e.amount_paise, 0);
  const provisionalRefund = previewQ.data?.provisional_refund_paise ?? 0;

  // Running balance must be computed chronologically (oldest → newest) even
  // though the query and the table below display newest-first.
  const rowsWithBalance: RowWithBalance[] = useMemo(() => {
    const asc = [...entries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    let running = 0;
    const withBalance = asc.map((e) => {
      running += e.direction === "CREDIT" ? e.amount_paise : -e.amount_paise;
      return { ...e, balance_paise: running };
    });
    return withBalance.reverse();
  }, [entries]);

  const counts = useMemo(
    () => ({
      ALL: rowsWithBalance.length,
      DEPOSIT: rowsWithBalance.filter((e) => categoryOf(e.entry_type) === "DEPOSIT").length,
      DEDUCTION: rowsWithBalance.filter((e) => categoryOf(e.entry_type) === "DEDUCTION").length,
      REFUND: rowsWithBalance.filter((e) => categoryOf(e.entry_type) === "REFUND").length,
    }),
    [rowsWithBalance],
  );

  const filteredRows = useMemo(() => {
    let rows = rowsWithBalance;
    if (filter !== "ALL") rows = rows.filter((e) => categoryOf(e.entry_type) === filter);
    if (dateFrom) rows = rows.filter((e) => e.created_at.slice(0, 10) >= dateFrom);
    if (dateTo) rows = rows.filter((e) => e.created_at.slice(0, 10) <= dateTo);
    return rows;
  }, [rowsWithBalance, filter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(0);
  }, [filter, dateFrom, dateTo, activeAllocationId]);

  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const exportColumns: CsvColumn<RowWithBalance>[] = [
    {
      key: "created_at",
      label: "Date",
      format: (v) => new Date(v as string).toLocaleString(),
    },
    { key: "description", label: "Description" },
    { key: "entry_type", label: "Type", format: (v) => typeMeta(v as EntryType).label },
    { key: "allocation_id", label: "Reference", format: (v) => referenceOf(v as string) },
    {
      key: "amount_paise",
      label: "Amount",
      format: (v, row) => `${row.direction === "CREDIT" ? "+" : "-"}${formatInr(v as number)}`,
    },
    { key: "balance_paise", label: "Balance", format: (v) => formatInr(v as number) },
    { key: "entry_type", label: "Status", format: (v) => statusMeta(v as EntryType).label },
  ];

  const dateRangeLabel =
    dateFrom && dateTo
      ? `${dateFrom} – ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Until ${dateTo}`
          : "Select date range";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient">
        <p className="text-xs font-semibold text-muted-foreground">Select Student</p>
        <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={studentPickerOpen}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/60 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {selectedStudent ? (
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                      {initialsOf(selectedStudent.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {selectedStudent.full_name} ({selectedStudent.admission_number})
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        selectedStudent.email,
                        activeAllocation?.rooms?.room_number
                          ? `Room ${activeAllocation.rooms.room_number}`
                          : null,
                        selectedStudent.status === "ACTIVE" ? "Active" : selectedStudent.status,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Select a student</span>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Search by name or admission number…" />
              <CommandList>
                <CommandEmpty>No student found.</CommandEmpty>
                <CommandGroup>
                  {(students.data ?? []).map((s) => {
                    const alloc = s.allocations?.find((a) => a.status === "ACTIVE") ?? null;
                    return (
                      <CommandItem
                        key={s.id}
                        value={`${s.full_name} ${s.admission_number}`}
                        onSelect={() => {
                          setStudentId(s.id);
                          setStudentPickerOpen(false);
                        }}
                        className="gap-3"
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            studentId === s.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-muted text-[10px] font-semibold">
                            {initialsOf(s.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {s.full_name} ({s.admission_number})
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[
                              s.email,
                              alloc?.rooms?.room_number ? `Room ${alloc.rooms.room_number}` : null,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </span>
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {!studentId && (
        <EmptyState
          title="Select a student"
          description="Choose a student above to view their deposit ledger."
        />
      )}

      {studentId && !activeAllocationId && (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
          No active allocation for this student.
        </p>
      )}

      {activeAllocationId && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Wallet}
              label="Available Balance"
              value={formatInr(availableBalance)}
              caption="Current refundable deposit"
              tone="success"
            />
            <SummaryCard
              icon={FileMinus}
              label="Total Deductions"
              value={formatInr(totalDeductions)}
              caption="Approved deductions"
              tone="warning"
            />
            <SummaryCard
              icon={RotateCcw}
              label="Refunded"
              value={formatInr(refunded)}
              caption="Total refunded to student"
              tone="primary"
            />
            <SummaryCard
              icon={PiggyBank}
              label="Provisional Refund"
              value={previewQ.data ? formatInr(provisionalRefund) : "—"}
              caption="Estimated move-out refund"
              tone="info"
              infoTitle="Estimated amount if the student moved out today — deposit balance minus unpaid dues, not a final figure."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={filter === tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === tab.value
                      ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                      : "border-border/80 bg-card text-muted-foreground hover:bg-accent/30",
                  )}
                >
                  {tab.label} ({counts[tab.value]})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Date Range</span>
                    <span className="text-xs text-muted-foreground">{dateRangeLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Clear
                    </Button>
                    <Button size="sm" onClick={() => setRangeOpen(false)}>
                      Apply
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <ExportButton
                filename={`deposit-ledger-${selectedStudent?.admission_number ?? "student"}`}
                title={`Deposit Ledger — ${selectedStudent?.full_name ?? ""}`}
                rows={filteredRows}
                columns={exportColumns}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card-ambient">
            <div className="flex items-center gap-2.5 border-b border-border/80 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">
                  Transaction History
                </h2>
                <p className="text-xs text-muted-foreground">
                  Complete deposit transaction history for the selected student
                </p>
              </div>
            </div>

            {ledgerQ.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ) : ledgerQ.isError ? (
              <p className="p-6 text-center text-sm text-destructive">
                {ledgerQ.error instanceof Error ? ledgerQ.error.message : "Could not load ledger."}
              </p>
            ) : filteredRows.length === 0 ? (
              <EmptyState
                title="No transactions found"
                description={
                  entries.length === 0
                    ? "This student doesn't have any deposit transactions yet."
                    : "No transactions match the selected filter or date range."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/80 bg-card text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                      <tr>
                        <th className="px-3 py-3 sm:px-6 sm:py-4">Date</th>
                        <th className="px-3 py-3 sm:px-6 sm:py-4">Description</th>
                        <th className="px-3 py-3 sm:px-6 sm:py-4">Type</th>
                        <th className="px-3 py-3 sm:px-6 sm:py-4">Reference</th>
                        <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Amount</th>
                        <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Balance</th>
                        <th className="px-3 py-3 sm:px-6 sm:py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {pageRows.map((e) => {
                        const type = typeMeta(e.entry_type);
                        const status = statusMeta(e.entry_type);
                        return (
                          <tr key={e.id} className="transition-colors hover:bg-accent/20">
                            <td className="px-3 py-3 align-top text-xs text-muted-foreground sm:px-6 sm:py-4 sm:text-sm">
                              {new Date(e.created_at).toLocaleDateString(undefined, {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              <div className="text-[10px] text-muted-foreground/70">
                                {new Date(e.created_at).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top text-xs font-medium text-foreground sm:px-6 sm:py-4 sm:text-sm">
                              {e.entry_type.replaceAll("_", " ")}
                              {e.description ? (
                                <div className="text-[11px] font-normal text-muted-foreground">
                                  {e.description}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 align-top sm:px-6 sm:py-4">
                              <Badge
                                variant={type.variant === "secondary" ? "outline" : type.variant}
                              >
                                {type.label}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 align-top font-mono text-[11px] text-muted-foreground sm:px-6 sm:py-4 sm:text-xs">
                              {referenceOf(e.allocation_id)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-3 text-right align-top text-xs font-semibold sm:px-6 sm:py-4 sm:text-sm",
                                e.direction === "CREDIT" ? "text-success" : "text-destructive",
                              )}
                            >
                              {e.direction === "CREDIT" ? "+" : "-"}
                              {formatInr(e.amount_paise)}
                            </td>
                            <td className="px-3 py-3 text-right align-top text-xs font-semibold text-foreground sm:px-6 sm:py-4 sm:text-sm">
                              {formatInr(e.balance_paise)}
                            </td>
                            <td className="px-3 py-3 align-top sm:px-6 sm:py-4">
                              <Badge
                                variant={
                                  status.variant === "secondary" ? "outline" : status.variant
                                }
                              >
                                {status.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-border/80 px-3 sm:px-6">
                  <PaginationBar
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={filteredRows.length}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  infoTitle,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  caption: string;
  tone: SemanticTone;
  infoTitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
          SOLID_TONE_CLASSES[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold text-foreground">{value}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {caption}
          {infoTitle ? (
            <span title={infoTitle}>
              <Info className="h-3 w-3 shrink-0" aria-hidden />
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
