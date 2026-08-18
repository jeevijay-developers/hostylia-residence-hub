import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  /** 0-indexed current page. */
  page: number;
  pageSize: number;
  /** Total rows matching the current filter (from Supabase's `count: "exact"`), not just the loaded page. */
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Server-side pagination control (Previous/Next + "X–Y of Z") shared by every
 * data table that fetches via `.range()` instead of loading the full result
 * set. `total` must come from the query's exact count, not `data.length`.
 */
export function PaginationBar({ page, pageSize, total, onPageChange }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? "0 results" : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="tabular-nums">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
