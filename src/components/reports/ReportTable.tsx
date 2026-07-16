import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<Row> {
  key: keyof Row & string;
  header: string;
  render?: (row: Row) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
}

interface Props<Row extends Record<string, unknown>> {
  rows: Row[];
  columns: Column<Row>[];
  pageSize?: number;
  empty?: React.ReactNode;
}

/**
 * Reusable read-only table for report surfaces.
 * Pagination is client-side over the already-fetched RLS-scoped rows.
 * All queries feeding this table run through the user's session — never service-role.
 */
export function ReportTable<Row extends Record<string, unknown>>({
  rows, columns, pageSize = 25, empty,
}: Props<Row>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{empty ?? "No data for the selected filters."}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.align === "right" && "text-right")}>
                  {c.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => {
                        if (sortKey === c.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        else { setSortKey(c.key); setSortDir("asc"); }
                      }}
                    >
                      {c.header}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.align === "right" && "text-right tabular-nums")}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page + 1} of {totalPages} — {sorted.length} rows</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
