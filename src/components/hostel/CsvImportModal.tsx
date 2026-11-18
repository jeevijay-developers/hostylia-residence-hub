import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportStructure, validateCsvRows } from "@/lib/hostel.functions";
import { parseCsv, type CsvParseError } from "@/lib/csv-parse";
import { downloadCsv } from "@/lib/csv";
import { STRUCTURE_CSV_FILENAME, buildStructureTemplateCsv } from "@/lib/structure-csv-template";

interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

const REQUIRED_HEADERS = ["floor_name", "room_number", "room_type"];

export function CsvImportModal({
  open,
  onOpenChange,
  tenantId,
  propertyId,
  onDone,
}: CsvImportModalProps) {
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  // Source line of each kept row, so row-level errors can point at the file.
  const [rowLines, setRowLines] = useState<number[]>([]);
  const [parseErrors, setParseErrors] = useState<CsvParseError[]>([]);
  const [errors, setErrors] = useState<{ row: number; error: string }[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    errors: { row: number; error: string }[];
  } | null>(null);

  const validateFn = useServerFn(validateCsvRows);
  const importFn = useServerFn(bulkImportStructure);

  const validate = useMutation({
    mutationFn: async (rows: Record<string, string>[]) =>
      validateFn({ data: { rows, property_id: propertyId } }),
    onSuccess: (res) => {
      setErrors(res.errors);
      setValidCount(res.valid.length);
    },
  });

  const rowLabel = (row: number) =>
    rowLines[row - 1] ? `Row ${row} (line ${rowLines[row - 1]})` : `Row ${row}`;

  const doImport = useMutation({
    mutationFn: async () =>
      importFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          // server re-validates — cast is safe
          rows: rawRows as never,
        },
      }),
    onSuccess: (res) => {
      onDone();
      if (res.failed === 0) {
        toast.success(`Imported ${res.inserted} rooms`);
        onOpenChange(false);
        return;
      }
      // Each row is its own transaction: successful rows are kept, failed rows
      // left nothing behind. Stay open so the failures can be read and fixed.
      toast.warning(`Imported ${res.inserted} rooms, ${res.failed} failed`);
      setImportResult({ inserted: res.inserted, errors: res.errors });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  function handleFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""), REQUIRED_HEADERS);
      const rows = parsed.rows.map((r) => r.cells);
      setImportResult(null);
      setParseErrors(parsed.errors);
      setRawRows(rows);
      setRowLines(parsed.rows.map((r) => r.line));
      setErrors([]);
      setValidCount(0);
      if (rows.length > 0) validate.mutate(rows);
    };
    reader.readAsText(f);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import structure (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Columns:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              block_name, block_code, floor_name, floor_number, room_number, room_type, capacity,
              base_rent
            </code>
            . <code className="rounded bg-muted px-1 py-0.5 text-xs">capacity</code> is derived for
            SINGLE (1), DOUBLE (2) and TRIPLE (3) — leave it blank or match the type; DORM and
            CUSTOM require a capacity. Beds are generated from the validated capacity. Leave{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">block_name</code> empty if you
            don't use blocks;{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">block_code</code> is optional.
            Wrap values containing commas in quotes. Fix any errors shown below before importing; if
            a row still fails during import, only that row is rolled back.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(STRUCTURE_CSV_FILENAME, buildStructureTemplateCsv())}
          >
            <Download className="mr-2 h-4 w-4" /> Download sample CSV
          </Button>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            {rawRows.length
              ? `${rawRows.length} rows loaded — choose another file`
              : "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {(rawRows.length > 0 || parseErrors.length > 0) && !importResult && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" /> Preview
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {validCount} valid • {errors.length + parseErrors.length} errors
              </p>
              {parseErrors.length + errors.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto text-xs text-destructive">
                  {[
                    ...parseErrors.map((e) => ({ key: `p${e.line}-${e.error}`, text: e.error })),
                    ...errors.map((e) => ({
                      key: `r${e.row}`,
                      text: `${rowLabel(e.row)}: ${e.error}`,
                    })),
                  ]
                    .slice(0, 20)
                    .map((e) => (
                      <li key={e.key}>{e.text}</li>
                    ))}
                  {parseErrors.length + errors.length > 20 && (
                    <li>…and {parseErrors.length + errors.length - 20} more</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {importResult && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {importResult.inserted} rooms imported, {importResult.errors.length} failed
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Failed rows were rolled back completely (no partial block, floor, room or beds). Fix
                them in the file and import again — rows that already imported will be reported as
                existing rooms.
              </p>
              <ul className="mt-2 max-h-40 overflow-auto text-xs text-destructive">
                {importResult.errors.slice(0, 50).map((e) => (
                  <li key={e.row}>
                    {rowLabel(e.row)}: {e.error}
                  </li>
                ))}
                {importResult.errors.length > 50 && (
                  <li>…and {importResult.errors.length - 50} more</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult && (
            <Button
              disabled={
                rawRows.length === 0 ||
                errors.length > 0 ||
                parseErrors.length > 0 ||
                validate.isPending ||
                doImport.isPending
              }
              onClick={() => doImport.mutate()}
            >
              Import {validCount || ""} rows
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
