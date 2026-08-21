import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Calendar, CalendarCheck2, CalendarX2, Clock, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ReportTable, type Column } from "@/components/reports/ReportTable";
import { ExportButton } from "@/components/reports/ExportButton";
import { cn, toneClasses, type SemanticTone } from "@/lib/utils";
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
          r.status === "PRESENT" ? "info" : r.status === "ABSENT" ? "destructive" : "outline"
        }
        className="rounded-full"
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
 * Parent-facing Monthly Attendance Report — a restyled fork of the shared
 * `parent/MonthlyAttendanceReport` (also used by the Student Attendance
 * page), kept separate so this visual pass doesn't affect that screen.
 * Same queries, same ReportTable/ExportButton (unchanged, shared with the
 * admin Reports area) — only the summary tiles and card chrome differ.
 */
export function MonthlyAttendanceReportCard({
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
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="font-display text-lg sm:text-xl">
            Monthly attendance report
          </CardTitle>
          {canExport && (
            <ExportButton
              filename={`attendance-${monthStart}`}
              title={`Attendance — ${monthStart}`}
              rows={rows}
              columns={dailyCsv}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="monthly-attendance-month" className="text-sm text-muted-foreground">
            Month
          </Label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="monthly-attendance-month"
              type="month"
              className="h-10 w-44 rounded-xl pl-9"
              value={monthInput}
              max={currentMonthValue()}
              onChange={(e) => setMonthInput(e.target.value)}
              aria-label={`Attendance month, currently ${monthLabel}`}
            />
          </div>
        </div>

        {s && s.marked_days > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Summary label="Present" value={s.present_days} icon={CalendarCheck2} tone="success" />
            <Summary label="Absent" value={s.absent_days} icon={CalendarX2} tone="destructive" />
            <Summary label="Late" value={s.late_days} icon={Clock} tone="warning" />
            <Summary label="Leave" value={s.leave_days} icon={Briefcase} tone="info" />
            <Summary
              label="Attendance %"
              value={s.attendance_pct === null ? "—" : `${s.attendance_pct}%`}
              icon={RotateCw}
              tone="info"
              className="col-span-2 sm:col-span-1"
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

function Summary({
  label,
  value,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: SemanticTone;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-card p-4 shadow-card-ambient", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div
          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", toneClasses[tone])}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-1.5 font-display text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
