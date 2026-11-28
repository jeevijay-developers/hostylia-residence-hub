import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** KPI tile used on a property's Overview and Rooms & Beds tabs. */
export function KpiTile({
  icon: Icon,
  label,
  value,
  badge,
  caption,
  isLoading,
  aside,
  className,
}: {
  icon: LucideIcon;
  label: string;
  /** null = the count could not be loaded; shown as an em dash, never a made-up 0. */
  value: number | null;
  badge?: ReactNode;
  caption: string;
  isLoading?: boolean;
  /** Extra detail on the right, separated by a divider (e.g. maintenance / blocked counts). */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient",
        className,
      )}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[28px]">
              {value === null ? "—" : value.toLocaleString("en-IN")}
            </p>
            {badge}
          </div>
        )}
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={caption}>
          {caption}
        </p>
      </div>
      {aside ? (
        <div className="shrink-0 border-l border-border/70 pl-3.5 text-xs text-muted-foreground">
          {aside}
        </div>
      ) : null}
    </div>
  );
}

export function SharePill({ value, description }: { value: number; description: string }) {
  return (
    <span
      className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground tabular-nums"
      title={description}
    >
      {value}%<span className="sr-only"> {description}</span>
    </span>
  );
}
