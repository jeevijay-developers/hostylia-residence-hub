import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Download, FileText, Loader2, RotateCw, Upload } from "lucide-react";

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
import { cn, getErrorMessage } from "@/lib/utils";
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
  // True only once the server validated the current file's rows.
  const [isValidated, setIsValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFileEmpty, setIsFileEmpty] = useState(false);
  // Bumped whenever the loaded file changes or the dialog resets, so a late
  // validation response for an old file can't overwrite the current state.
  const fileToken = useRef(0);

  const validateFn = useServerFn(validateCsvRows);
  const importFn = useServerFn(bulkImportStructure);

  const validate = useMutation({
    mutationFn: async ({ rows }: { rows: Record<string, string>[]; token: number }) =>
      validateFn({ data: { rows, property_id: propertyId } }),
    onSuccess: (res, vars) => {
      if (vars.token !== fileToken.current) return;
      setErrors(res.errors);
      setValidCount(res.valid.length);
      setValidationError(null);
      setIsValidated(true);
    },
    onError: (e, vars) => {
      if (vars.token !== fileToken.current) return;
      const message = getErrorMessage(e, "We couldn't check this file. Please try again.");
      setIsValidated(false);
      setValidationError(message);
      toast.error(`Couldn't validate the CSV: ${message}`);
    },
  });

  function resetState() {
    fileToken.current += 1;
    setRawRows([]);
    setRowLines([]);
    setParseErrors([]);
    setErrors([]);
    setValidCount(0);
    setImportResult(null);
    setIsValidated(false);
    setValidationError(null);
    setIsFileEmpty(false);
    validate.reset();
  }

  // Closing the dialog (from inside or by the parent) discards the loaded file,
  // so reopening never offers to re-submit rows that were already imported.
  useEffect(() => {
    if (!open) resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on close
  }, [open]);

  function runValidation(rows: Record<string, string>[]) {
    setValidationError(null);
    setIsValidated(false);
    validate.mutate({ rows, token: fileToken.current });
  }

  const rowLabel = (row: number) =>
    rowLines[row - 1] ? `Row ${row} (line ${rowLines[row - 1]})` : `Row ${row}`;

  const doImport = useMutation({
    mutationFn: async ({ rows }: { rows: Record<string, string>[]; token: number }) =>
      importFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          // server re-validates — cast is safe
          rows: rows as never,
        },
      }),
    onSuccess: (res, vars) => {
      onDone();
      // The dialog was closed (or reset) while the import ran: report the
      // outcome, but don't write it into the dialog's fresh state.
      const isStale = vars.token !== fileToken.current;
      if (res.failed === 0) {
        toast.success(`Imported ${res.inserted} rooms`);
        if (isStale) return;
        resetState();
        onOpenChange(false);
        return;
      }
      if (isStale) {
        toast.warning(
          `Imported ${res.inserted} rooms, ${res.failed} failed. Reopen the import and choose the fixed file to retry the failed rows.`,
        );
        return;
      }
      // Each row is its own transaction: successful rows are kept, failed rows
      // left nothing behind. Stay open so the failures can be read and fixed.
      // The submitted rows are dropped so they can't be re-submitted as-is;
      // the next import needs a freshly chosen (fixed) file.
      toast.warning(`Imported ${res.inserted} rooms, ${res.failed} failed`);
      fileToken.current += 1;
      setRawRows([]);
      setParseErrors([]);
      setErrors([]);
      setValidCount(0);
      setIsValidated(false);
      setValidationError(null);
      setIsFileEmpty(false);
      setImportResult({ inserted: res.inserted, errors: res.errors });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Import failed. Please try again.")),
  });

  function handleFile(f: File) {
    fileToken.current += 1;
    const token = fileToken.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== fileToken.current) return;
      const parsed = parseCsv(String(reader.result ?? ""), REQUIRED_HEADERS);
      const rows = parsed.rows.map((r) => r.cells);
      setImportResult(null);
      setParseErrors(parsed.errors);
      setRawRows(rows);
      setRowLines(parsed.rows.map((r) => r.line));
      setErrors([]);
      setValidCount(0);
      setIsValidated(false);
      setValidationError(null);
      setIsFileEmpty(rows.length === 0 && parsed.errors.length === 0);
      if (rows.length > 0) runValidation(rows);
    };
    reader.onerror = () => {
      if (token !== fileToken.current) return;
      toast.error("We couldn't read that file. Please choose it again.");
    };
    reader.readAsText(f);
  }

  const canImport =
    rawRows.length > 0 &&
    isValidated &&
    validCount > 0 &&
    errors.length === 0 &&
    parseErrors.length === 0 &&
    !validate.isPending &&
    !doImport.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import structure (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/60">
            <li>
              Columns, in this order:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                block_name
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                block_code
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                floor_name
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                floor_number
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                room_number
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                room_type
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">capacity</code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                base_rent
              </code>
              .
            </li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">capacity</code>{" "}
              is set automatically for SINGLE (1), DOUBLE (2) and TRIPLE (3) — leave it blank or
              match the type.
            </li>
            <li>DORM and CUSTOM rooms need a capacity.</li>
            <li>Beds are created from the room's capacity.</li>
            <li>
              Leave{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                block_name
              </code>{" "}
              empty if you don't use blocks;{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                block_code
              </code>{" "}
              is optional.
            </li>
            <li>Wrap any value that contains a comma in quotes.</li>
            <li>
              Fix the errors shown below before importing. If a row still fails during import, only
              that row is skipped — the rest are saved.
            </li>
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(STRUCTURE_CSV_FILENAME, buildStructureTemplateCsv())}
          >
            <Download className="mr-2 h-4 w-4" /> Download sample CSV
          </Button>

          <label
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-sm",
              doImport.isPending
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-muted",
            )}
            aria-disabled={doImport.isPending}
          >
            <Upload className="h-4 w-4" />
            {rawRows.length
              ? `${rawRows.length} rows loaded — choose another file`
              : "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              // A new file mid-import would orphan the running import's result.
              disabled={doImport.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                // Clear so choosing the same (fixed) file again fires onChange.
                e.target.value = "";
              }}
            />
          </label>

          {isFileEmpty && !importResult && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This file has no data rows. Add at least one room below the header row.
            </p>
          )}

          {(rawRows.length > 0 || parseErrors.length > 0) && !importResult && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" /> Preview
              </div>
              {validate.isPending ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {rawRows.length} rows…
                </p>
              ) : validationError ? (
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive"
                  role="alert"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    Couldn't validate this file: {validationError}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runValidation(rawRows)}
                  >
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry check
                  </Button>
                </div>
              ) : isValidated || parseErrors.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {validCount} valid • {errors.length + parseErrors.length} errors
                </p>
              ) : null}
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
              disabled={!canImport}
              onClick={() => doImport.mutate({ rows: rawRows, token: fileToken.current })}
            >
              {doImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {validCount || ""} rows
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
