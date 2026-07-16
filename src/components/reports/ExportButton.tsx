import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";

interface Props<Row extends Record<string, unknown>> {
  filename: string;
  rows: Row[];
  columns: CsvColumn<Row>[];
  disabled?: boolean;
}

/**
 * Streams the on-screen rows to a CSV blob — no Edge Function,
 * no server round-trip. Data scope is whatever the server already
 * returned under RLS, so this cannot leak outside the caller's scope.
 * Not rendered for Warden per PRD §7 RBAC matrix.
 */
export function ExportButton<Row extends Record<string, unknown>>({
  filename,
  rows,
  columns,
  disabled,
}: Props<Row>) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
    >
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
