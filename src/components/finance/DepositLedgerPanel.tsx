import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { previewMoveOut } from "@/lib/student.functions";
import { formatInr } from "@/lib/finance";

/**
 * Read-only finance view of a student's deposit ledger + provisional
 * move-out refund — reuses `previewMoveOut` (already used by the Admin
 * move-out wizard) and the existing `dep_ledger_staff_read` RLS policy
 * (already grants ACCOUNTANT via is_finance_staff). Does NOT expose the
 * move-out action itself — that stays an Admin/property-management
 * operation, out of Accountant scope.
 */
export function DepositLedgerPanel({ propertyId }: { propertyId: string }) {
  const [studentId, setStudentId] = useState("");

  const students = useQuery({
    queryKey: ["finance-students", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, allocations(id, status)")
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const activeAllocationId =
    students.data?.find((s) => s.id === studentId)?.allocations?.find((a) => a.status === "ACTIVE")
      ?.id ?? null;

  const ledgerQ = useQuery({
    queryKey: ["deposit-ledger", activeAllocationId],
    enabled: !!activeAllocationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_ledger_entries")
        .select("id, entry_type, direction, amount_paise, description, created_at")
        .eq("allocation_id", activeAllocationId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const previewFn = useServerFn(previewMoveOut);
  const previewQ = useQuery({
    queryKey: ["moveout-preview", activeAllocationId],
    enabled: !!activeAllocationId,
    queryFn: () => previewFn({ data: { allocation_id: activeAllocationId! } }),
  });

  const balance = (ledgerQ.data ?? []).reduce(
    (sum, e) => sum + (e.direction === "CREDIT" ? e.amount_paise : -e.amount_paise),
    0,
  );

  return (
    <div className="space-y-4">
      <Select value={studentId} onValueChange={setStudentId}>
        <SelectTrigger className="sm:w-80">
          <SelectValue placeholder="Select a student" />
        </SelectTrigger>
        <SelectContent>
          {(students.data ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name} ({s.admission_number})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {studentId && !activeAllocationId && (
        <p className="text-sm text-muted-foreground">No active allocation for this student.</p>
      )}

      {activeAllocationId && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Current deposit balance</p>
              <p className="text-xl font-semibold">{formatInr(balance)}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Provisional move-out refund</p>
              <p className="text-xl font-semibold">
                {previewQ.data ? formatInr(previewQ.data.provisional_refund_paise) : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ledger history</p>
            {ledgerQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!ledgerQ.isLoading && (ledgerQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No deposit entries yet.</p>
            )}
            {!ledgerQ.isLoading &&
              (ledgerQ.data ?? []).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                >
                  <span>
                    {e.entry_type.replaceAll("_", " ")} · {e.description}
                    {" · "}
                    {new Date(e.created_at).toLocaleDateString()}
                  </span>
                  <span className={e.direction === "CREDIT" ? "text-success" : "text-destructive"}>
                    {e.direction === "CREDIT" ? "+" : "-"}
                    {formatInr(e.amount_paise)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
