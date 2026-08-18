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
import { bulkImportStudents } from "@/lib/student.functions";
import { studentBulkRowSchema } from "@/schemas/student";

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
  const [errors, setErrors] = useState<{ row: number; error: string }[]>([]);
  const importFn = useServerFn(bulkImportStudents);

  const importMut = useMutation({
    mutationFn: async () =>
      importFn({ data: { tenant_id: tenantId, property_id: propertyId, rows: rows as never } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} • Failed ${r.failed}`);
      if (r.errors.length) console.warn(r.errors);
      onDone();
      onOpenChange(false);
      setRows([]);
      setErrors([]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  function onFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      setRows(parsed);
      const errs: { row: number; error: string }[] = [];
      parsed.forEach((r, i) => {
        const res = studentBulkRowSchema.safeParse(r);
        if (!res.success)
          errs.push({ row: i + 1, error: res.error.issues.map((x) => x.message).join("; ") });
      });
      setErrors(errs);
    };
    reader.readAsText(f);
  }

  const validCount = rows.length - errors.length;

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
            . Rows with errors are skipped — valid rows still import.
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
                <FileText className="h-4 w-4" /> Preview
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {validCount} valid • {errors.length} errors (skipped on import)
              </p>
              {errors.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto text-xs text-destructive">
                  {errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                  {errors.length > 20 && <li>…and {errors.length - 20} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={validCount === 0 || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            Import {validCount || ""} valid rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
