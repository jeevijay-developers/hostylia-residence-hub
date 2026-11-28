function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Spreadsheet formula injection: text starting with = + - @ (or a tab/CR) is
  // run as a formula by Excel/Sheets. Prefix such user text with an apostrophe
  // so it stays plain text. Real numbers are left untouched.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Client-side CSV download — no server round-trip, exports whatever rows are already loaded. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
