/**
 * Small RFC 4180 CSV parser (no CSV library is installed in this project).
 *
 * Supports quoted fields containing commas, escaped quotes ("" inside quotes),
 * multiline quoted values, CRLF / LF / CR line endings and a leading BOM.
 * Malformed input never throws: it is reported as line-numbered errors and the
 * offending record is dropped, so one bad row can't shift the columns of the
 * rows after it.
 */

export interface CsvRecord {
  /** 1-based line in the file where this record starts. */
  line: number;
  cells: Record<string, string>;
}

export interface CsvParseError {
  /** 1-based line in the file (the line the problem starts on). */
  line: number;
  error: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRecord[];
  errors: CsvParseError[];
}

interface RawRecord {
  line: number;
  cells: string[];
  /** First problem found while reading this record, if any. */
  problem?: string;
}

function tokenize(input: string): { records: RawRecord[]; errors: CsvParseError[] } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: RawRecord[] = [];
  const errors: CsvParseError[] = [];

  let cells: string[] = [];
  let field = "";
  let quoted = false; // current field began with a quote
  let inQuotes = false;
  let afterClosingQuote = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;
  let problem: string | undefined;

  const endField = () => {
    cells.push(quoted ? field : field.trim());
    field = "";
    quoted = false;
    afterClosingQuote = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, cells, problem });
    cells = [];
    problem = undefined;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        afterClosingQuote = true;
        i++;
        continue;
      }
      if (ch === "\r") {
        // Normalize CRLF / CR inside a quoted value to \n.
        if (text[i + 1] === "\n") i++;
        field += "\n";
        line++;
        i++;
        continue;
      }
      if (ch === "\n") line++;
      field += ch;
      i++;
      continue;
    }

    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
      i++;
      continue;
    }
    if (ch === '"') {
      if (!quoted && !afterClosingQuote && field.trim() === "") {
        // Opening quote (leading spaces before it are ignored).
        quoted = true;
        inQuotes = true;
        quoteLine = line;
        field = "";
      } else {
        problem ??= `Line ${line}: unexpected quote character inside a value. Wrap the whole value in quotes and write a quote as "".`;
        field += ch;
      }
      i++;
      continue;
    }
    if (afterClosingQuote) {
      if (ch !== " " && ch !== "\t") {
        problem ??= `Line ${line}: unexpected text after a closing quote. Separate values with commas.`;
        field += ch;
      }
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (inQuotes) {
    errors.push({
      line: quoteLine,
      error: `Quoted value starting on line ${quoteLine} is never closed (missing closing quote).`,
    });
    return { records, errors };
  }
  // Final record without a trailing newline.
  if (cells.length > 0 || field !== "" || quoted) endRecord();

  return { records, errors };
}

export function parseCsv(text: string, requiredHeaders: string[] = []): CsvParseResult {
  const { records, errors } = tokenize(text);
  const isBlank = (r: RawRecord) => r.cells.every((c) => c === "");
  const nonBlank = records.filter((r) => !isBlank(r));

  const headerRecord = nonBlank[0];
  if (!headerRecord) {
    errors.push({ line: 1, error: "The file is empty or has no header row." });
    return { headers: [], rows: [], errors };
  }

  const headers = headerRecord.cells;
  if (headerRecord.problem) errors.push({ line: headerRecord.line, error: headerRecord.problem });
  const seen = new Set<string>();
  for (const h of headers) {
    if (h !== "" && seen.has(h)) {
      errors.push({ line: headerRecord.line, error: `Duplicate column "${h}" in the header row.` });
    }
    seen.add(h);
  }
  const missing = requiredHeaders.filter((h) => !seen.has(h));
  if (missing.length > 0) {
    errors.push({
      line: headerRecord.line,
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    });
    return { headers, rows: [], errors };
  }

  const rows: CsvRecord[] = [];
  for (const rec of nonBlank.slice(1)) {
    if (rec.problem) {
      errors.push({ line: rec.line, error: rec.problem });
      continue;
    }
    if (rec.cells.length > headers.length) {
      errors.push({
        line: rec.line,
        error: `Line ${rec.line}: found ${rec.cells.length} values but the header has ${headers.length} columns. A value containing a comma must be wrapped in quotes.`,
      });
      continue;
    }
    // Fewer values than headers: trailing columns are treated as blank.
    rows.push({
      line: rec.line,
      cells: Object.fromEntries(headers.map((h, idx) => [h, rec.cells[idx] ?? ""])),
    });
  }

  errors.sort((a, b) => a.line - b.line);
  return { headers, rows, errors };
}
