import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceTable } from "@/components/finance/InvoiceTable";
import { InvoiceDetailDialog } from "@/components/finance/InvoiceDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { cn } from "@/lib/utils";

/**
 * Finance-focused student lookup for Accountant — deliberately minimal
 * (name/ID/room + invoice history), not the full Admin student-management
 * module. Reuses the existing `InvoiceTable` + `InvoiceDetailDialog`
 * (which already shows payment history and receipt downloads) instead of
 * building a second invoice-list/detail UI.
 */
export function StudentFinancePanel({ propertyId }: { propertyId: string }) {
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const studentsQ = useQuery({
    queryKey: ["finance-students", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, allocations(status, rooms(room_number))")
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const students = useMemo(() => {
    const list = studentsQ.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (s) =>
        s.full_name.toLowerCase().includes(term) || s.admission_number.toLowerCase().includes(term),
    );
  }, [studentsQ.data, search]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;

  const invoicesQ = useQuery({
    queryKey: ["student-invoices", selectedStudentId],
    enabled: !!selectedStudentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, student_id, issue_date, due_date, status, total_paise, paid_paise, balance_paise, fee_plans(name)",
        )
        .eq("student_id", selectedStudentId!)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const outstanding = (invoicesQ.data ?? []).reduce((sum, i) => sum + i.balance_paise, 0);
  const feePlanName = invoicesQ.data?.find((i) => i.fee_plans)?.fee_plans?.name ?? null;

  function roomOf(s: (typeof students)[number]) {
    return s.allocations?.find((a) => a.status === "ACTIVE")?.rooms?.room_number;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or admission #"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {studentsQ.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
        {!studentsQ.isLoading && students.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No students found.
          </p>
        )}
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStudentId(s.id)}
              className={cn(
                "w-full rounded-xl border p-3 text-left text-sm transition",
                selectedStudentId === s.id
                  ? "border-primary/60 bg-primary/5 shadow-sm"
                  : "border-border/80 bg-card hover:bg-muted/40",
              )}
            >
              <p className="font-medium text-foreground">{s.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {s.admission_number}
                {roomOf(s) ? ` · Room ${roomOf(s)}` : ""}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!selectedStudent && (
          <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-center text-sm text-muted-foreground">
            Select a student to see their finance details.
          </p>
        )}
        {selectedStudent && (
          <div className="space-y-4">
            <Card className="shadow-card-ambient">
              <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="font-medium text-foreground">{selectedStudent.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Admission #</p>
                  <p className="font-medium text-foreground">
                    {selectedStudent.admission_number}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Room</p>
                  <p className="font-medium text-foreground">{roomOf(selectedStudent) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fee plan</p>
                  <p className="font-medium text-foreground">{feePlanName ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card-ambient">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
                  <Wallet className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding balance</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {formatInr(outstanding)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Invoice history</p>
              {invoicesQ.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
              {!invoicesQ.isLoading && (
                <InvoiceTable
                  rows={invoicesQ.data ?? []}
                  onSelect={(r) => setSelectedInvoiceId(r.id)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {selectedInvoiceId && (
        <InvoiceDetailDialog
          invoiceId={selectedInvoiceId}
          onOpenChange={(open) => {
            if (!open) setSelectedInvoiceId(null);
          }}
        />
      )}
    </div>
  );
}
