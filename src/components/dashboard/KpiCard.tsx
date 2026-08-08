import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
