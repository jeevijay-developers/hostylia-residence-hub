import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ReportTable, type Column } from "@/components/reports/ReportTable";
import { ExportButton } from "@/components/reports/ExportButton";
import { OccupancyChart, DsoChart, SlaComplianceChart } from "@/components/reports/charts";
import { getOccupancyReport, getAgingReport, getSlaComplianceReport } from "@/lib/reports.functions";
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
  { key: "occupancy_pct", header: "Occupancy %", align: "right", sortable: true,
    render: (r) => `${r.occupancy_pct}%` },
];

const occupancyCsv: CsvColumn<OccupancyRow>[] = occupancyCols.map((c) => ({ key: c.key, label: c.header }));

export function OccupancyReportPanel({ propertyId, showExport = true }: { propertyId: string; showExport?: boolean }) {
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
        {showExport && <ExportButton filename="occupancy-report.csv" rows={rows} columns={occupancyCsv} />}
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
  { key: "balance_paise", header: "Outstanding", align: "right", sortable: true,
    render: (r) => formatInr(r.balance_paise) },
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

export function AgingReportPanel({ propertyId, showExport = true }: { propertyId: string; showExport?: boolean }) {
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
        {showExport && <ExportButton filename="aging-report.csv" rows={rows} columns={agingCsv} />}
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
  { key: "sla_compliance_pct", header: "Compliance %", align: "right", sortable: true,
    render: (r) => r.sla_compliance_pct === null ? "—" : `${r.sla_compliance_pct}%` },
];

const slaCsv: CsvColumn<SlaRow>[] = slaCols.map((c) => ({ key: c.key, label: c.header }));

export function SlaComplianceReportPanel({ propertyId, showExport = true }: { propertyId: string; showExport?: boolean }) {
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
        {showExport && <ExportButton filename="sla-compliance.csv" rows={rows} columns={slaCsv} />}
      </div>
      {rows.length > 0 && <SlaComplianceChart data={rows} />}
      <ReportTable rows={rows} columns={slaCols} />
    </section>
  );
}

/* ----------------------- ATTENDANCE STUB ----------------------- */

// TODO(Phase 11): swap this stub for a real query against the `attendance`
// table once Phase 11 introduces it. The report shape should stay:
// per-student, per-day presence + roll-up % — this panel is the wire-up point.
export function AttendanceReportPanel() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Attendance summary</h2>
      <EmptyState
        title="Attendance reporting available once your hostel tracks attendance"
        description="This report activates automatically after the attendance module goes live."
      />
    </section>
  );
}

/* ----------------------- shared KPI ----------------------- */

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const t = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${t}`}>{value}</p>
    </div>
  );
}
