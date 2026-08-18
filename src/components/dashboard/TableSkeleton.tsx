import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  /** Number of columns to fill — should match the real <TableHead> count. */
  columns: number;
  rows?: number;
  /**
   * Per-column relative width so the skeleton reads like the real row shape
   * (e.g. a name column wider than a status column) instead of uniform bars.
   * Cycles if shorter than `columns`. Defaults to a plausible generic taper.
   */
  widths?: string[];
}

const DEFAULT_WIDTHS = ["w-32", "w-24", "w-20", "w-16", "w-12"];

/**
 * Drop-in `<TableBody>` replacement for the loading state of any data table
 * built on `src/components/ui/table.tsx` — shows row/column-shaped bars
 * instead of a single generic block, so the page doesn't visibly jump when
 * real rows arrive. Render this in place of the real `<TableBody>` while
 * `query.isLoading`, inside the same `<Table>`/`<TableHeader>` shell.
 */
export function TableSkeleton({ columns, rows = 6, widths = DEFAULT_WIDTHS }: TableSkeletonProps) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className={`h-4 ${widths[c % widths.length]}`} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
