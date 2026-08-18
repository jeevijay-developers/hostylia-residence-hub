import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";
import { downloadPdf } from "@/lib/pdf";

interface Props<Row extends Record<string, unknown>> {
  /** Base filename without extension, e.g. "occupancy-report". */
  filename: string;
  /** Heading printed at the top of the PDF. Defaults to the filename. */
  title?: string;
  rows: Row[];
  columns: CsvColumn<Row>[];
  disabled?: boolean;
}

/**
 * Exports the same on-screen rows as CSV or PDF — no Edge Function,
 * no server round-trip. Data scope is whatever the server already
 * returned under RLS, so this cannot leak outside the caller's scope.
 * Whether a given caller shows this button is a per-report `showExport`
 * decision made by the page rendering the panel, driven by that report's
 * own row in PRD §7's RBAC matrix — Warden has no export right on
 * Occupancy/SLA but does on Reports & analytics (e.g. attendance).
 */
export function ExportButton<Row extends Record<string, unknown>>({
  filename,
  title,
  rows,
  columns,
  disabled,
}: Props<Row>) {
  const isDisabled = disabled || rows.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isDisabled}>
          <Download className="mr-2 h-4 w-4" />
          Export
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => downloadCsv(`${filename}.csv`, toCsv(rows, columns))}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => downloadPdf(`${filename}.pdf`, title ?? filename, rows, columns)}
        >
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
