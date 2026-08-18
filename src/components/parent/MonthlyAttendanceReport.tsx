import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ReportTable, type Column } from "@/components/reports/ReportTable";
import { ExportButton } from "@/components/reports/ExportButton";
import type { CsvColumn } from "@/lib/csv";
import type { Tables } from "@/integrations/supabase/types";

type AttendanceRecord = Tables<"attendance">;

interface MonthlySummaryRow {
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  out_pass_days: number;
  marked_days: number;
  attendance_pct: number | null;
}

interface DailyRow extends Record<string, unknown> {
  attendance_date: string;
  session: string;
  status: string;
  notes: string | null;
}

const dailyCols: Column<DailyRow>[] = [
  { key: "attendance_date", header: "Date", sortable: true },
  { key: "session", header: "Session", sortable: true },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (r) => (
      <Badge
        variant={
          r.status === "PRESENT" ? "secondary" : r.status === "ABSENT" ? "destructive" : "outline"
        }
      >
        {r.status}
      </Badge>
    ),
  },
  { key: "notes", header: "Notes", render: (r) => r.notes ?? "—" },
];

const dailyCsv: CsvColumn<DailyRow>[] = [
  { key: "attendance_date", label: "Date" },
  { key: "session", label: "Session" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes", format: (v) => (v ? String(v) : "") },
];

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(monthInput: string): number {
  const [y, m] = monthInput.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Monthly Attendance Report — self-scoped (Student) or linked-child-scoped
 * (Parent, via ParentPageFrame). Reads `attendance` directly and the
 * v_attendance_monthly_summary roll-up view (both RLS-protected: att_student_read
 * / att_parent_read already restrict rows to this student/linked child — no
 * server fn needed, same "simple RLS-protected read" convention as
 * AttendanceHistoryList). Export matches PRD §7 "Data export (student PII)":
 * Student X (self), Parent X (linked child).
 */
export function MonthlyAttendanceReport({
  studentId,
  canExport = true,
  initialMonth,
}: {
  studentId: string;
  canExport?: boolean;
  initialMonth?: string;
}) {
  const [monthInput, setMonthInput] = useState(initialMonth ?? currentMonthValue()); // "YYYY-MM"
  const monthStart = `${monthInput}-01`;
  const monthEnd = `${monthInput}-${String(daysInMonth(monthInput)).padStart(2, "0")}`;

  const summaryQ = useQuery({
    queryKey: ["attendance-monthly-summary", studentId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_attendance_monthly_summary" as never)
        .select("*")
        .eq("student_id", studentId)
        .eq("month", monthStart)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as MonthlySummaryRow | null;
    },
  });

  const dailyQ = useQuery({
    queryKey: ["attendance-monthly-detail", studentId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRecord[];
    },
  });

  const rows = useMemo<DailyRow[]>(
    () =>
      (dailyQ.data ?? []).map((r) => ({
        attendance_date: r.attendance_date,
        session: r.session,
        status: r.status,
        notes: r.notes,
      })),
    [dailyQ.data],
  );

  const s = summaryQ.data;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Monthly attendance report</CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="monthly-attendance-month" className="text-xs text-muted-foreground">
              Month
            </Label>
            <Input
              id="monthly-attendance-month"
              type="month"
              className="h-9 w-40"
              value={monthInput}
              max={currentMonthValue()}
              onChange={(e) => setMonthInput(e.target.value)}
            />
          </div>
          {canExport && (
            <ExportButton
              filename={`attendance-${monthStart}`}
              title={`Attendance — ${monthStart}`}
              rows={rows}
              columns={dailyCsv}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {s && s.marked_days > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Summary label="Present" value={s.present_days} />
            <Summary label="Absent" value={s.absent_days} />
            <Summary label="Late" value={s.late_days} />
            <Summary label="Leave" value={s.leave_days} />
            <Summary
              label="Attendance %"
              value={s.attendance_pct === null ? "—" : `${s.attendance_pct}%`}
            />
          </div>
        )}
        <ReportTable
          rows={rows}
          columns={dailyCols}
          empty="No attendance recorded for this month."
        />
      </CardContent>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
