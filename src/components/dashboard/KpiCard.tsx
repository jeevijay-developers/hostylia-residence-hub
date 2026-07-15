import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value?: string | number | null;
  loading?: boolean;
  trend?: { direction: "up" | "down"; label: string };
}

export function KpiCard({ icon: Icon, label, value, loading, trend }: KpiCardProps) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
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
