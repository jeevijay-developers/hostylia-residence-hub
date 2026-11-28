import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RotateCw,
  Upload,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsv, type CsvParseError } from "@/lib/csv-parse";
import { downloadCsv } from "@/lib/csv";
import { invalidateStudentsTab } from "@/lib/property-students";
import {
  STUDENT_CSV_COLUMNS,
  STUDENT_CSV_FILENAME,
  STUDENT_CSV_REQUIRED_HEADERS,
  buildStudentTemplateCsv,
} from "@/lib/student-csv-template";
import { bulkImportStudents, previewStudentImport } from "@/lib/student.functions";
import { usePropertyFeePlans } from "@/lib/student-placement";
import { cn, getErrorMessage } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

type RowError = { row: number; error: string; kind: "DUPLICATE" | "FAILED" };
interface PreviewResult {
  ok: number;
  duplicates: number;
  failed: number;
  errors: RowError[];
}
interface ImportResult {
  inserted: number;
  allocated: number;
  invoiced: number;
  duplicates: number;
  failed: number;
  errors: RowError[];
}

const MAX_LISTED_ERRORS = 50;
const REQUIRED = new Set(STUDENT_CSV_REQUIRED_HEADERS);

function hasBedCells(row: Record<string, string>): boolean {
  return Boolean((row.room_number ?? "").trim() || (row.bed_code ?? "").trim());
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function StudentBulkImportModal({
  open,
  onOpenChange,
  tenantId,
  propertyId,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  // Source line of each kept row, so row-level errors can point at the file.
  const [rowLines, setRowLines] = useState<number[]>([]);
  const [parseErrors, setParseErrors] = useState<CsvParseError[]>([]);
  const [isFileEmpty, setIsFileEmpty] = useState(false);
  const [feePlanId, setFeePlanId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Bumped whenever the file or the dialog resets, so a late response for an old file is ignored.
  const fileToken = useRef(0);

  const feePlansQ = usePropertyFeePlans(propertyId);
  const previewFn = useServerFn(previewStudentImport);
  const importFn = useServerFn(bulkImportStudents);

  const hasBedRows = rows.some(hasBedCells);

  const previewMut = useMutation({
    mutationFn: (vars: { rows: Record<string, string>[]; feePlanId: string; token: number }) =>
      previewFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          fee_plan_id: vars.feePlanId || undefined,
          rows: vars.rows,
        },
      }),
    onSuccess: (r, vars) => {
      if (vars.token !== fileToken.current) return;
      setPreview(r);
      setPreviewError(null);
    },
    onError: (e, vars) => {
      if (vars.token !== fileToken.current) return;
      setPreview(null);
      setPreviewError(getErrorMessage(e, "We couldn't check this file. Please try again."));
    },
  });

  function resetState() {
    fileToken.current += 1;
    setRows([]);
    setRowLines([]);
    setParseErrors([]);
    setIsFileEmpty(false);
    setFeePlanId("");
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    previewMut.reset();
  }

  // Closing discards the loaded file, so reopening never re-offers rows that already imported.
  useEffect(() => {
    if (!open) resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on close
  }, [open]);

  function runPreview(nextRows: Record<string, string>[], nextFeePlanId: string) {
    setPreview(null);
    setPreviewError(null);
    previewMut.mutate({ rows: nextRows, feePlanId: nextFeePlanId, token: fileToken.current });
  }

  const importMut = useMutation({
    mutationFn: (vars: { rows: Record<string, string>[]; feePlanId: string; token: number }) =>
      importFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          fee_plan_id: vars.feePlanId || undefined,
          rows: vars.rows,
        },
      }),
    onSuccess: async (r, vars) => {
      await invalidateStudentsTab(qc, propertyId);
      onDone();
      const extras = [
        r.allocated ? `${r.allocated} given a bed` : null,
        r.invoiced ? `${r.invoiced} with opening dues` : null,
      ].filter(Boolean);
      const isStale = vars.token !== fileToken.current;
      if (r.duplicates === 0 && r.failed === 0) {
        toast.success(`Imported ${plural(r.inserted, "student")}`, {
          description: extras.length ? `${extras.join(", ")}.` : undefined,
        });
        if (!isStale) onOpenChange(false);
        return;
      }
      toast.warning(
        `Imported ${r.inserted} • Duplicates skipped ${r.duplicates} • Failed ${r.failed}`,
      );
      if (isStale) return;
      // Each row is its own transaction: imported rows are kept, failed rows left nothing behind.
      // Drop the submitted rows so they can't be re-submitted as-is; keep the report readable.
      fileToken.current += 1;
      setRows([]);
      setParseErrors([]);
      setPreview(null);
      setResult(r);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Import failed. Please try again.")),
  });

  function handleFile(f: File) {
    fileToken.current += 1;
    const token = fileToken.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== fileToken.current) return;
      const parsed = parseCsv(String(reader.result ?? ""), STUDENT_CSV_REQUIRED_HEADERS);
      const nextRows = parsed.rows.map((r) => r.cells);
      setResult(null);
      setRows(nextRows);
      setRowLines(parsed.rows.map((r) => r.line));
      setParseErrors(parsed.errors);
      setIsFileEmpty(nextRows.length === 0 && parsed.errors.length === 0);
      if (nextRows.length > 0) runPreview(nextRows, feePlanId);
      else {
        setPreview(null);
        setPreviewError(null);
      }
    };
    reader.onerror = () => {
      if (token !== fileToken.current) return;
      toast.error("We couldn't read that file. Please choose it again.");
    };
    reader.readAsText(f);
  }

  function changeFeePlan(next: string) {
    setFeePlanId(next);
    if (rows.length > 0) runPreview(rows, next);
  }

  const rowLabel = (row: number) =>
    rowLines[row - 1] ? `Row ${row} (line ${rowLines[row - 1]})` : `Row ${row}`;

  const validCount = preview?.ok ?? 0;
  const isBusy = importMut.isPending;
  const canImport = rows.length > 0 && validCount > 0 && !previewMut.isPending && !isBusy;
  const feePlans = feePlansQ.data ?? [];

  const listed = [
    ...(result ? [] : parseErrors).map((e) => ({
      key: `p${e.line}-${e.error}`,
      text: `Line ${e.line} [Skipped]: ${e.error}`,
    })),
    ...(result?.errors ?? preview?.errors ?? []).map((e) => ({
      key: `${e.kind}-${e.row}`,
      text: `${rowLabel(e.row)} [${e.kind === "DUPLICATE" ? "Duplicate" : result ? "Failed" : "Invalid"}]: ${e.error}`,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && isBusy ? undefined : onOpenChange(o))}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
          <DialogTitle>Bulk import students (CSV)</DialogTitle>
          <DialogDescription>
            Same details as Add student. Valid rows import even if others are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Columns, in this order</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="CSV columns">
              {STUDENT_CSV_COLUMNS.map((c) => (
                <li key={c.key}>
                  <code
                    className={cn(
                      "rounded bg-muted px-1.5 py-0.5 text-xs",
                      REQUIRED.has(c.key)
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {c.label}
                    {REQUIRED.has(c.key) && (
                      <>
                        <span aria-hidden="true" className="text-destructive">
                          *
                        </span>
                        <span className="sr-only"> (required)</span>
                      </>
                    )}
                  </code>
                </li>
              ))}
            </ul>
          </div>

          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/60">
            <li>
              Only <code className="rounded bg-muted px-1 text-xs text-foreground">full_name</code>{" "}
              is required. A blank admission_number is generated; status is APPLICANT (default) or
              VERIFIED.
            </li>
            <li>
              To assign a bed, fill both room_number and bed_code (the bed must be vacant) and pick
              a fee plan below. start_date defaults to today.
            </li>
            <li>
              opening_dues_rupees is for admission fees, back-dues or other one-off charges. Rent
              and deposit are billed automatically after the agreement is signed.
            </li>
            <li>
              paid_rupees (up to the dues) needs a payment_mode: CASH, UPI, BANK_TRANSFER or OTHER;
              UPI and BANK_TRANSFER also need a payment_reference. Record cheques from Finance.
            </li>
            <li>
              Rows whose phone, email or admission ID already belongs to a student (or repeats
              earlier in the file) are skipped as duplicates. Wrap values containing commas in
              quotes.
            </li>
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(STUDENT_CSV_FILENAME, buildStudentTemplateCsv())}
          >
            <Download aria-hidden="true" className="h-4 w-4" /> Download sample CSV
          </Button>

          <label
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-sm focus-within:ring-2 focus-within:ring-ring",
              isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
            )}
            aria-disabled={isBusy}
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            {rows.length
              ? `${plural(rows.length, "row")} loaded — choose another file`
              : "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={isBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                // Clear so choosing the same (fixed) file again fires onChange.
                e.target.value = "";
              }}
            />
          </label>

          {isFileEmpty && !result && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
              This file has no data rows. Add at least one student below the header row.
            </p>
          )}

          {hasBedRows && !result && (
            <div className="space-y-1.5">
              <Label htmlFor="student-import-fee-plan">
                Fee plan for rows that assign a bed
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
              </Label>
              {feePlansQ.isError ? (
                <p role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1 text-destructive">{feePlansQ.error.message}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => feePlansQ.refetch()}
                  >
                    <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
                  </Button>
                </p>
              ) : !feePlansQ.isPending && feePlans.length === 0 ? (
                <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
                  No active fee plan — create one in Finance first
                </p>
              ) : (
                <Select
                  disabled={isBusy || feePlansQ.isPending}
                  value={feePlanId}
                  onValueChange={changeFeePlan}
                >
                  <SelectTrigger
                    id="student-import-fee-plan"
                    aria-describedby="student-import-fee-plan-hint"
                  >
                    <SelectValue
                      placeholder={feePlansQ.isPending ? "Loading fee plans…" : "Choose a fee plan"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {feePlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p id="student-import-fee-plan-hint" className="text-xs text-muted-foreground">
                Sets each placed student's rent and deposit (the bed's own rent wins when set).
              </p>
            </div>
          )}

          {(rows.length > 0 || parseErrors.length > 0 || result) && (
            <div
              className="rounded-md border border-border bg-muted/40 p-3 text-sm"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 font-medium">
                {result ? (
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
                ) : (
                  <FileText aria-hidden="true" className="h-4 w-4" />
                )}
                {result ? "Import result" : "Preview"}
              </div>
              {result ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{result.inserted}</span> imported (
                  {result.allocated} given a bed, {result.invoiced} with opening dues) •{" "}
                  <span className="font-medium text-foreground">{result.duplicates}</span>{" "}
                  duplicates skipped •{" "}
                  <span className="font-medium text-foreground">{result.failed}</span> failed. Fix
                  the listed rows and import them again.
                </p>
              ) : previewMut.isPending ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Checking{" "}
                  {plural(rows.length, "row")}…
                </p>
              ) : previewError ? (
                <div
                  role="alert"
                  className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">Couldn't check this file: {previewError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runPreview(rows, feePlanId)}
                  >
                    <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry check
                  </Button>
                </div>
              ) : preview ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{preview.ok}</span> will import •{" "}
                  <span className="font-medium text-foreground">{preview.duplicates}</span>{" "}
                  duplicates (skipped) •{" "}
                  <span className="font-medium text-foreground">
                    {preview.failed + parseErrors.length}
                  </span>{" "}
                  invalid (skipped)
                </p>
              ) : null}
              {listed.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto text-xs text-destructive">
                  {listed.slice(0, MAX_LISTED_ERRORS).map((e) => (
                    <li key={e.key}>{e.text}</li>
                  ))}
                  {listed.length > MAX_LISTED_ERRORS && (
                    <li>…and {listed.length - MAX_LISTED_ERRORS} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-card px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={!canImport}
              onClick={() => importMut.mutate({ rows, feePlanId, token: fileToken.current })}
            >
              {isBusy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {isBusy
                ? "Importing…"
                : validCount > 0
                  ? `Import ${plural(validCount, "valid row")}`
                  : "Import valid rows"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
