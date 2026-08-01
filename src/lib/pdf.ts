import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CsvColumn } from "@/lib/csv";

/**
 * Renders the same on-screen rows used for CSV export as a table in a
 * client-side PDF — no Edge Function, no server round-trip, same RLS-scoped
 * data the caller already has.
 */
export function downloadPdf<Row extends Record<string, unknown>>(
  filename: string,
  title: string,
  rows: Row[],
  columns: CsvColumn<Row>[],
) {
  const doc = new jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) =>
      columns.map((c) => {
        const v = c.format ? c.format(row[c.key], row) : row[c.key];
        return v === null || v === undefined ? "" : String(v);
      }),
    ),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(filename);
}
