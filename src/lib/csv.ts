/**
 * Tiny client-side CSV serializer. Report exports only send data
 * that is already on-screen (RLS-filtered by the server), so scope
 * cannot leak — the caller decides columns.
 */
export interface CsvColumn<Row> {
  key: keyof Row & string;
  label: string;
  /** Optional formatter (defaults to String(value)). */
  format?: (value: unknown, row: Row) => string | number | null | undefined;
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<Row extends Record<string, unknown>>(
  rows: Row[],
  columns: CsvColumn<Row>[],
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCell(c.format ? c.format(row[c.key], row) : row[c.key])).join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
