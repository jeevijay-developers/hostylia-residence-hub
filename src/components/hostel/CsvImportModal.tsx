import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportStructure, validateCsvRows } from "@/lib/hostel.functions";

interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

/** Minimal CSV parser (no quoted-comma support). Sufficient for the
 *  bulk-structure template shipped in the UI download link. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export function CsvImportModal({
  open, onOpenChange, tenantId, propertyId, onDone,
}: CsvImportModalProps) {
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<{ row: number; error: string }[]>([]);
  const [validCount, setValidCount] = useState(0);

  const validateFn = useServerFn(validateCsvRows);
  const importFn = useServerFn(bulkImportStructure);

  const validate = useMutation({
    mutationFn: async (rows: Record<string, string>[]) =>
      validateFn({ data: { rows } }),
    onSuccess: (res) => {
      setErrors(res.errors);
      setValidCount(res.valid.length);
    },
  });

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
      toast.success(`Imported ${res.inserted} rooms (${res.failed} failed)`);
      if (res.errors.length) console.warn("Import errors:", res.errors);
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  function handleFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      setRawRows(rows);
      validate.mutate(rows);
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
            Columns: <code className="rounded bg-muted px-1 py-0.5 text-xs">
              block_name, floor_name, floor_number, room_number, room_type, capacity, base_rent
            </code>
            . Beds are generated automatically from capacity. Leave{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">block_name</code> empty
            if you don't use blocks.
          </p>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            {rawRows.length ? `${rawRows.length} rows loaded — choose another file` : "Choose CSV file"}
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

          {rawRows.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" /> Preview
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {validCount} valid • {errors.length} errors
              </p>
              {errors.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto text-xs text-destructive">
                  {errors.slice(0, 20).map((e) => (
                    <li key={e.row}>Row {e.row}: {e.error}</li>
                  ))}
                  {errors.length > 20 && <li>…and {errors.length - 20} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={
              rawRows.length === 0 || errors.length > 0 || doImport.isPending
            }
            onClick={() => doImport.mutate()}
          >
            Import {validCount || ""} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
