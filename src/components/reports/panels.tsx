import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReportTable, type Column } from "@/components/reports/ReportTable";
import { ExportButton } from "@/components/reports/ExportButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OccupancyChart, DsoChart, SlaComplianceChart } from "@/components/reports/charts";
import {
  getOccupancyReport,
  getAgingReport,
  getSlaComplianceReport,
  getAttendanceReport,
} from "@/lib/reports.functions";
import { formatInr } from "@/lib/finance";
import type { CsvColumn } from "@/lib/csv";

/* ----------------------- OCCUPANCY ----------------------- */

interface OccupancyRow extends Record<string, unknown> {
  block_id: string | null;
  block_name: string;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  maintenance_beds: number;
  blocked_beds: number;
  occupancy_pct: number;
}

const occupancyCols: Column<OccupancyRow>[] = [
  { key: "block_name", header: "Block", sortable: true },
  { key: "total_beds", header: "Total", align: "right", sortable: true },
  { key: "occupied_beds", header: "Occupied", align: "right", sortable: true },
  { key: "vacant_beds", header: "Vacant", align: "right", sortable: true },
  { key: "maintenance_beds", header: "Maintenance", align: "right", sortable: true },
  { key: "blocked_beds", header: "Blocked", align: "right", sortable: true },
  {
    key: "occupancy_pct",
    header: "Occupancy %",
    align: "right",
    sortable: true,
    render: (r) => `${r.occupancy_pct}%`,
  },
];

const occupancyCsv: CsvColumn<OccupancyRow>[] = occupancyCols.map((c) => ({
  key: c.key,
  label: c.header,
}));

export function OccupancyReportPanel({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const fn = useServerFn(getOccupancyReport);
  const q = useQuery({
    queryKey: ["report-occupancy", propertyId],
    queryFn: () => fn({ data: { property_id: propertyId } }),
  });
  const rows = (q.data ?? []) as OccupancyRow[];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Occupancy accuracy</h2>
        {showExport && (
          <ExportButton
            filename="occupancy-report"
            title="Occupancy accuracy"
            rows={rows}
            columns={occupancyCsv}
          />
        )}
      </div>
      {rows.length > 0 && <OccupancyChart data={rows} />}
      <ReportTable rows={rows} columns={occupancyCols} />
    </section>
  );
}

/* ----------------------- AGING / DSO ----------------------- */

interface AgingInvoiceRow extends Record<string, unknown> {
  invoice_number: string;
  students: { full_name: string } | null;
  due_date: string;
  days_overdue: number;
  aging_bucket: string;
  balance_paise: number;
  status: string;
}

const agingCols: Column<AgingInvoiceRow>[] = [
  { key: "invoice_number", header: "Invoice #", sortable: true },
  { key: "students", header: "Student", render: (r) => r.students?.full_name ?? "—" },
  { key: "due_date", header: "Due", sortable: true },
  { key: "days_overdue", header: "Days overdue", align: "right", sortable: true },
  { key: "aging_bucket", header: "Bucket", sortable: true },
  {
    key: "balance_paise",
    header: "Outstanding",
    align: "right",
    sortable: true,
    render: (r) => formatInr(r.balance_paise),
  },
  { key: "status", header: "Status", sortable: true },
];

const agingCsv: CsvColumn<AgingInvoiceRow>[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "students", label: "Student", format: (_, r) => r.students?.full_name ?? "" },
  { key: "due_date", label: "Due" },
  { key: "days_overdue", label: "Days overdue" },
  { key: "aging_bucket", label: "Bucket" },
  { key: "balance_paise", label: "Outstanding (INR)", format: (v) => (Number(v) / 100).toFixed(2) },
  { key: "status", label: "Status" },
];

export function AgingReportPanel({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const fn = useServerFn(getAgingReport);
  const q = useQuery({
    queryKey: ["report-aging", propertyId],
    queryFn: () => fn({ data: { property_id: propertyId } }),
  });
  const d = q.data;
  const rows = (d?.rows ?? []).filter((r: any) => r.aging_bucket !== "paid") as AgingInvoiceRow[];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">DSO &amp; aging</h2>
        {showExport && (
          <ExportButton
            filename="aging-report"
            title="DSO & aging"
            rows={rows}
            columns={agingCsv}
          />
        )}
      </div>
      {d && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Outstanding" value={formatInr(d.total_outstanding_paise)} tone="warning" />
          <Kpi label="Collected" value={formatInr(d.total_collected_paise)} tone="success" />
          <Kpi label="Total issued" value={formatInr(d.total_issued_paise)} />
          <Kpi label="DSO (avg days)" value={`${d.dso_days}d`} />
        </div>
      )}
      {d && <DsoChart aging={d.aging_paise} />}
      <ReportTable rows={rows} columns={agingCols} empty="No overdue invoices. 🎉" />
    </section>
  );
}

/* ----------------------- SLA COMPLIANCE ----------------------- */

interface SlaRow extends Record<string, unknown> {
  category_name: string;
  warden_name: string;
  total_complaints: number;
  resolved_within_sla: number;
  breached: number;
  resolved_total: number;
  sla_compliance_pct: number | null;
}

const slaCols: Column<SlaRow>[] = [
  { key: "category_name", header: "Category", sortable: true },
  { key: "warden_name", header: "Warden", sortable: true },
  { key: "total_complaints", header: "Total", align: "right", sortable: true },
  { key: "resolved_within_sla", header: "Within SLA", align: "right", sortable: true },
  { key: "breached", header: "Breached", align: "right", sortable: true },
  {
    key: "sla_compliance_pct",
    header: "Compliance %",
    align: "right",
    sortable: true,
    render: (r) => (r.sla_compliance_pct === null ? "—" : `${r.sla_compliance_pct}%`),
  },
];

const slaCsv: CsvColumn<SlaRow>[] = slaCols.map((c) => ({ key: c.key, label: c.header }));

export function SlaComplianceReportPanel({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const fn = useServerFn(getSlaComplianceReport);
  const q = useQuery({
    queryKey: ["report-sla", propertyId],
    queryFn: () => fn({ data: { property_id: propertyId } }),
  });
  const rows = (q.data ?? []) as SlaRow[];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Complaint SLA compliance</h2>
        {showExport && (
          <ExportButton
            filename="sla-compliance"
            title="Complaint SLA compliance"
            rows={rows}
            columns={slaCsv}
          />
        )}
      </div>
      {rows.length > 0 && <SlaComplianceChart data={rows} />}
      <ReportTable rows={rows} columns={slaCols} />
    </section>
  );
}

/* ----------------------- MONTHLY ATTENDANCE ----------------------- */

interface AttendanceSummaryRow extends Record<string, unknown> {
  student_id: string;
  full_name: string;
  admission_number: string;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  out_pass_days: number;
  marked_days: number;
  attendance_pct: number | null;
}

const attendanceCols: Column<AttendanceSummaryRow>[] = [
  { key: "full_name", header: "Student", sortable: true },
  { key: "admission_number", header: "Admission #", sortable: true },
  { key: "present_days", header: "Present", align: "right", sortable: true },
  { key: "absent_days", header: "Absent", align: "right", sortable: true },
  { key: "late_days", header: "Late", align: "right", sortable: true },
  { key: "leave_days", header: "Leave", align: "right", sortable: true },
  { key: "out_pass_days", header: "Out-pass", align: "right", sortable: true },
  { key: "marked_days", header: "Marked days", align: "right", sortable: true },
  {
    key: "attendance_pct",
    header: "Attendance %",
    align: "right",
    sortable: true,
    render: (r) => (r.attendance_pct === null ? "—" : `${r.attendance_pct}%`),
  },
];

const attendanceCsv: CsvColumn<AttendanceSummaryRow>[] = attendanceCols.map((c) => ({
  key: c.key,
  label: c.header,
}));

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AttendanceReportPanel({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const [monthInput, setMonthInput] = useState(currentMonthValue()); // "YYYY-MM"
  const month = `${monthInput}-01`; // matches v_attendance_monthly_summary.month

  const fn = useServerFn(getAttendanceReport);
  const q = useQuery({
    queryKey: ["report-attendance", propertyId, month],
    queryFn: () => fn({ data: { property_id: propertyId, month } }),
  });
  const rows = useMemo(() => (q.data ?? []) as AttendanceSummaryRow[], [q.data]);

  const summary = useMemo(() => {
    const studentsMarked = rows.filter((r) => r.marked_days > 0).length;
    const present = rows.reduce((s, r) => s + r.present_days, 0);
    const absent = rows.reduce((s, r) => s + r.absent_days, 0);
    const withPct = rows.filter((r) => r.attendance_pct !== null);
    const avgPct = withPct.length
      ? Math.round(
          (withPct.reduce((s, r) => s + (r.attendance_pct ?? 0), 0) / withPct.length) * 10,
        ) / 10
      : null;
    return { studentsMarked, present, absent, avgPct };
  }, [rows]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Attendance summary</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="attendance-report-month" className="text-xs text-muted-foreground">
              Month
            </Label>
            <Input
              id="attendance-report-month"
              type="month"
              className="h-9 w-40"
              value={monthInput}
              max={currentMonthValue()}
              onChange={(e) => setMonthInput(e.target.value)}
            />
          </div>
          {showExport && (
            <ExportButton
              filename={`attendance-report-${month}`}
              title={`Attendance summary — ${month}`}
              rows={rows}
              columns={attendanceCsv}
            />
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Students marked" value={String(summary.studentsMarked)} />
          <Kpi label="Present (days)" value={String(summary.present)} tone="success" />
          <Kpi label="Absent (days)" value={String(summary.absent)} tone="warning" />
          <Kpi
            label="Avg attendance %"
            value={summary.avgPct === null ? "—" : `${summary.avgPct}%`}
          />
        </div>
      )}

      <ReportTable
        rows={rows}
        columns={attendanceCols}
        empty="No attendance marked for this month yet."
      />
    </section>
  );
}

/* ----------------------- shared KPI ----------------------- */

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const t =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${t}`}>{value}</p>
    </div>
  );
}
