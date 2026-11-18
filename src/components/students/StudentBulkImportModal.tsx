import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { bulkImportStudents, previewStudentImport } from "@/lib/student.functions";

const CSV_COLUMNS = [
  "full_name",
  "phone",
  "email",
  "date_of_birth",
  "gender",
  "academic_institute",
  "course_name",
  "guardian_name",
  "guardian_phone",
];
const CSV_SAMPLE_ROW = [
  "Riya Sharma",
  "9876543210",
  "riya.sharma@example.com",
  "2005-04-12",
  "Female",
  "ABC Institute of Technology",
  "B.Tech CSE",
  "Sunita Sharma",
  "9876500000",
];

function downloadSampleCsv() {
  const csv = [CSV_COLUMNS.join(","), CSV_SAMPLE_ROW.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

export function StudentBulkImportModal({
  open,
  onOpenChange,
  tenantId,
  propertyId,
  onDone,
}: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  type RowError = { row: number; error: string; kind: "DUPLICATE" | "FAILED" };
  // Server-side dry run: validation + duplicates against existing students and within the file.
  const [preview, setPreview] = useState<{
    ok: number;
    duplicates: number;
    failed: number;
    errors: RowError[];
  } | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    duplicates: number;
    failed: number;
    errors: RowError[];
  } | null>(null);
  const previewFn = useServerFn(previewStudentImport);
  const importFn = useServerFn(bulkImportStudents);

  const previewMut = useMutation({
    mutationFn: async (parsed: Record<string, string>[]) =>
      previewFn({ data: { tenant_id: tenantId, property_id: propertyId, rows: parsed } }),
    onSuccess: (r) => setPreview(r),
    onError: (e) => {
      setPreview(null);
      toast.error(e instanceof Error ? e.message : "Could not check the file");
    },
  });

  const importMut = useMutation({
    mutationFn: async () =>
      importFn({ data: { tenant_id: tenantId, property_id: propertyId, rows } }),
    onSuccess: (r) => {
      onDone();
      if (r.duplicates === 0 && r.failed === 0) {
        toast.success(`Imported ${r.inserted} students`);
        onOpenChange(false);
        setRows([]);
        setPreview(null);
        setResult(null);
        return;
      }
      // Keep the dialog open so the skipped rows and reasons can be read.
      toast.warning(
        `Imported ${r.inserted} • Duplicates skipped ${r.duplicates} • Failed ${r.failed}`,
      );
      setResult(r);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  function onFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      setRows(parsed);
      setResult(null);
      setPreview(null);
      if (parsed.length > 0) previewMut.mutate(parsed);
    };
    reader.readAsText(f);
  }

  const validCount = preview?.ok ?? 0;
  const shown = result ?? preview;
  const shownErrors = shown?.errors ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import students (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Columns:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              full_name, phone, email, date_of_birth, gender, academic_institute, course_name,
              guardian_name, guardian_phone
            </code>
            . Rows whose phone or email already belongs to a registered student (or repeats earlier
            in the file) are skipped as duplicates; other valid rows still import.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
            <Download className="mr-2 h-4 w-4" /> Download sample CSV
          </Button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            {rows.length ? `${rows.length} rows loaded — choose another file` : "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          {rows.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" /> {result ? "Import result" : "Preview"}
              </div>
              {previewMut.isPending && !result ? (
                <p className="mt-1 text-xs text-muted-foreground">Checking for duplicates…</p>
              ) : shown ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {result ? result.inserted : (preview?.ok ?? 0)}
                  </span>{" "}
                  {result ? "successful" : "will import"} •{" "}
                  <span className="font-medium text-foreground">{shown.duplicates}</span> duplicate
                  {shown.duplicates === 1 ? "" : "s"} (skipped) •{" "}
                  <span className="font-medium text-foreground">{shown.failed}</span> failed
                </p>
              ) : null}
              {shownErrors.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto text-xs text-destructive">
                  {shownErrors.slice(0, 50).map((e) => (
                    <li key={`${e.kind}-${e.row}`}>
                      Row {e.row} [{e.kind === "DUPLICATE" ? "Duplicate" : "Failed"}]: {e.error}
                    </li>
                  ))}
                  {shownErrors.length > 50 && <li>…and {shownErrors.length - 50} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              disabled={validCount === 0 || previewMut.isPending || importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              Import {validCount || ""} valid rows
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
