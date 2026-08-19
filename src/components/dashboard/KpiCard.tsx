import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, toneClasses, toneTextClasses, type SemanticTone } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value?: string | number | null;
  loading?: boolean;
  trend?: { direction: "up" | "down"; label: string };
  /** Icon accent — defaults to the brand tone so existing dashboards are unaffected. */
  tone?: SemanticTone;
  /** Plain icon with no background container, for dense KPI rows. Defaults to the existing boxed icon look. */
  bareIcon?: boolean;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  trend,
  tone = "primary",
  bareIcon = false,
}: KpiCardProps) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-2xl border border-border bg-card shadow-sm",
        bareIcon ? "min-h-[92px] p-4" : "min-h-[132px] p-4 sm:p-5",
      )}
    >
      <div
        className={
          bareIcon
            ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
            : "flex items-start justify-between gap-3"
        }
      >
        <p className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">{label}</p>
        {bareIcon ? (
          <Icon className={cn("h-4 w-4 shrink-0", toneTextClasses[tone])} />
        ) : (
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
              toneClasses[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {displayValue}
          </p>
        )}
      </div>
      {trend && !loading ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            trend.direction === "up" ? "text-success" : "text-destructive",
          )}
        >
          {trend.direction === "up" ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {trend.label}
        </div>
      ) : null}
    </div>
  );
}

interface KpiSummaryCardProps {
  icon: LucideIcon;
  label: string;
  value?: string | number | null;
  caption?: string;
  /** 0-100 — renders a slim progress track under the value instead of/alongside the caption. */
  progressPercent?: number;
  loading?: boolean;
  tone?: SemanticTone;
  /** Navigates to the relevant detail view — never rendered without one, so the chevron is never a dead affordance. */
  onNavigate: () => void;
}

const toneBorderClasses: Record<SemanticTone, string> = {
  primary: "border-l-primary",
  success: "border-l-success",
  destructive: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
  muted: "border-l-border",
};

const toneFillClasses: Record<SemanticTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

/** Actionable KPI tile: boxed icon, tinted left accent, a chevron that jumps to the detail view it
 * summarises, and a faint watermark of the same icon for visual depth. */
export function KpiSummaryCard({
  icon: Icon,
  label,
  value,
  caption,
  progressPercent,
  loading,
  tone = "primary",
  onNavigate,
}: KpiSummaryCardProps) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        "relative flex w-full flex-col items-stretch overflow-hidden rounded-2xl border border-l-4 border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/40",
        toneBorderClasses[tone],
      )}
    >
      <Icon
        className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24 text-foreground/5"
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="min-w-0 flex-1 pt-2 text-sm font-medium leading-snug text-foreground">
          {label}
        </p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="relative mt-3">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {displayValue}
          </p>
        )}
      </div>
      {!loading && progressPercent != null && (
        <div className="relative mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", toneFillClasses[tone])}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{progressPercent}%</span>
        </div>
      )}
      {caption && <p className="relative mt-1 text-xs text-muted-foreground">{caption}</p>}
    </button>
  );
}
