import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Simple flex container for filter controls (date range, block, category).
 * Filters that require data the current user can't see must not be rendered
 * — reuse existing RLS-scoped selectors rather than introducing new checks.
 */
export function ReportFilterBar({ children }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card/50 p-3">
      {children}
    </div>
  );
}
