import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { RotateCw } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * KPI tile for money figures — same look as the Overview tab's KpiTile, but
 * the value is pre-formatted (₹8.76L) with the exact amount in its tooltip.
 */
export function FinanceKpiTile({
  icon: Icon,
  label,
  value,
  valueTitle,
  badge,
  caption,
  isLoading,
  isError,
  onRetry,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueTitle?: string;
  badge?: ReactNode;
  caption: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-24" />
        ) : isError ? (
          <div className="mt-1 flex items-center gap-2">
            <p className="font-display text-2xl font-semibold text-muted-foreground">—</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCw className="h-3 w-3" aria-hidden="true" /> Try again
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p
              className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[28px]"
              title={valueTitle}
            >
              {value}
            </p>
            {badge}
          </div>
        )}
        <p
          className="mt-0.5 truncate text-xs text-muted-foreground"
          title={isError ? undefined : caption}
        >
          {isError ? "Couldn’t load this figure." : caption}
        </p>
      </div>
    </div>
  );
}

/** Small count pill next to a KPI value ("4 residents"), icon + text. */
export function CountPill({
  icon: Icon,
  children,
  tone = "muted",
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone === "warning" ? "bg-warning/10 text-warning" : "bg-muted text-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}
