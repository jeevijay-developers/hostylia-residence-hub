import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileText, Percent, Undo2, Wallet } from "lucide-react";

import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { ExportButton } from "@/components/reports/ExportButton";
import { Kpi } from "@/components/reports/panels";
import { ReportTable, type Column } from "@/components/reports/ReportTable";
import { DsoChart } from "@/components/reports/charts";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import {
  exportAgingInvoices,
  getAgingBuckets,
  getCollectionReport,
  listAgingInvoices,
  type AgingInvoice,
} from "@/lib/reports.functions";
import { formatInr } from "@/lib/finance";
import { currentMonthRange, formatRange, type DateRange } from "@/lib/report-range";
import type { CsvColumn } from "@/lib/csv";

const AGING_PAGE_SIZE = 25;

interface AgingRow extends Record<string, unknown> {
  invoice_number: string;
  student_name: string | null;
  due_date: string;
  days_overdue: number;
  aging_bucket: string;
  balance_paise: number;
  status: string;
}

// The aging list keeps its server order (most days overdue first), so its columns are not client-sortable.
const agingCols: Column<AgingRow>[] = [
  { key: "invoice_number", header: "Invoice #" },
  { key: "student_name", header: "Student", render: (r) => r.student_name ?? "—" },
  { key: "due_date", header: "Due" },
  { key: "days_overdue", header: "Days overdue", align: "right" },
  { key: "aging_bucket", header: "Bucket" },
  {
    key: "balance_paise",
    header: "Outstanding",
    align: "right",
    render: (r) => formatInr(r.balance_paise),
  },
  { key: "status", header: "Status" },
];

const agingCsv: CsvColumn<AgingRow>[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "student_name", label: "Student", format: (v) => String(v ?? "") },
  { key: "due_date", label: "Due" },
  { key: "days_overdue", label: "Days overdue" },
  { key: "aging_bucket", label: "Bucket" },
  { key: "balance_paise", label: "Outstanding (INR)", format: (v) => (Number(v) / 100).toFixed(2) },
  { key: "status", label: "Status" },
];

/** 78.5 -> "78.5%", 100 -> "100%", 33.333 -> "33.33%". */
function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/**
 * Admin Reports > DSO & aging. The KPIs describe ONE cohort: the invoices issued in the selected period (by issue
 * date, IST; default the current month; also Previous month or a custom range). Total billed, Payments received
 * (CAPTURED), Refunded amount (COMPLETED) and the Collection rate all refer to those same invoices, whenever
 * the payments / refunds happened. Pending payments and the Overdue invoices card use the same cohort. The aging
 * buckets and the unpaid-invoice list below are the existing all-time view (not limited to the period).
 */
export function CollectionsAgingPanel({
  propertyId,
  showExport = true,
}: {
  propertyId: string;
  showExport?: boolean;
}) {
  const navigate = useNavigate();
  const collectionFn = useServerFn(getCollectionReport);
  const bucketsFn = useServerFn(getAgingBuckets);
  const listFn = useServerFn(listAgingInvoices);
  const exportFn = useServerFn(exportAgingInvoices);

  // The default is the current month (IST).
  const [range, setRange] = useState<DateRange>(() => currentMonthRange());
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [propertyId]);

  const collectionQ = useQuery({
    queryKey: ["report-collection", propertyId, range.from, range.to],
    queryFn: () =>
      collectionFn({ data: { property_id: propertyId, from: range.from, to: range.to } }),
  });
  const bucketsQ = useQuery({
    queryKey: ["report-aging-buckets", propertyId],
    queryFn: () => bucketsFn({ data: { property_id: propertyId } }),
  });
  const listQ = useQuery({
    queryKey: ["report-aging-list", propertyId, page],
    queryFn: () => listFn({ data: { property_id: propertyId, page, pageSize: AGING_PAGE_SIZE } }),
  });

  const c = collectionQ.data;
  const rows = (listQ.data?.rows ?? []) as unknown as AgingRow[];
  const total = listQ.data?.total ?? 0;
  const period = `Invoices issued ${formatRange(range)} (IST)`;

  const openOverdue = () =>
    navigate({
      to: "/admin/finance/invoices",
      search: { scope: "overdue", from: range.from, to: range.to },
    });

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">
          DSO &amp; aging
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          {showExport && (
            <ExportButton
              filename="aging-report"
              title="DSO & aging"
              rows={rows}
              columns={agingCsv}
              loadRows={async () =>
                (await exportFn({ data: { property_id: propertyId } })) as unknown as AgingRow[]
              }
            />
          )}
        </div>
      </div>

      <p className="text-sm font-medium text-foreground" data-testid="report-period">
        {period}
      </p>

      {collectionQ.isError && (
        <p className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {collectionQ.error instanceof Error
            ? collectionQ.error.message
            : "Could not load the report."}
        </p>
      )}

      {c && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
          <Kpi
            icon={FileText}
            label="Total billed"
            value={formatInr(c.billed_paise)}
            tone="info"
            className="col-span-2 lg:col-span-2"
            detail={
              <p>
                {c.eligible_invoice_count} invoice{c.eligible_invoice_count === 1 ? "" : "s"} issued
                in this period
              </p>
            }
          />
          <Kpi
            icon={Wallet}
            label="Payments received"
            value={formatInr(c.received_paise)}
            tone="success"
            className="lg:col-span-2"
            detail={<p>Successful payments on these invoices</p>}
          />
          <Kpi
            icon={Undo2}
            label="Refunded amount"
            value={formatInr(c.refunded_paise)}
            tone="warning"
            className="lg:col-span-2"
            detail={<p>Completed refunds on these invoices</p>}
          />
          <Kpi
            icon={Percent}
            label="Collection rate"
            value={pct(c.collection_rate_pct)}
            tone="success"
            className="col-span-2 lg:col-span-2"
            detail={
              c.billed_paise === 0 ? (
                <p>No billed invoices in this period</p>
              ) : (
                <>
                  <p>
                    {formatInr(c.collected_paise)} collected of {formatInr(c.billed_paise)} billed
                  </p>
                  <p>
                    ({formatInr(c.received_paise)} received − {formatInr(c.refunded_paise)}{" "}
                    refunded)
                  </p>
                </>
              )
            }
          />
          <Kpi
            icon={Wallet}
            label="Pending payments"
            value={formatInr(c.pending_paise)}
            tone="warning"
            className="col-span-2 lg:col-span-2"
          />
          <Kpi
            icon={AlertTriangle}
            label="Overdue invoices"
            value={String(c.overdue_count)}
            tone="warning"
            className="col-span-2 lg:col-span-2"
            onClick={openOverdue}
            ariaLabel={`View ${c.overdue_count} overdue invoice${c.overdue_count === 1 ? "" : "s"}`}
            detail={
              c.due_unpaid_count === 0 ? (
                <p>No unpaid invoices in this period</p>
              ) : (
                <>
                  <p>
                    {pct(c.overdue_pct)} of {c.due_unpaid_count} unpaid invoice
                    {c.due_unpaid_count === 1 ? "" : "s"}
                  </p>
                  <p>{formatInr(c.overdue_balance_paise)} overdue · click to view the list</p>
                </>
              )
            }
          />
        </div>
      )}

      {bucketsQ.data && (
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6">
          <h3 className="text-sm font-semibold text-foreground">DSO aging buckets (₹)</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            All unpaid invoices of this property, whatever their issue date (not limited to the
            period above).
          </p>
          <DsoChart aging={bucketsQ.data.aging_paise} />
        </div>
      )}

      <div className="space-y-2">
        <ReportTable
          rows={rows}
          columns={agingCols}
          pageSize={AGING_PAGE_SIZE}
          isLoading={listQ.isLoading}
          empty="No overdue invoices. 🎉"
        />
        {total > 0 && (
          <PaginationBar
            page={page}
            pageSize={AGING_PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        )}
      </div>
    </section>
  );
}

export type { AgingInvoice };
