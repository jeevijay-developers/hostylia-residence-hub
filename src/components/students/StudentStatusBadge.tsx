import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  APPLICANT: "bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700/80",
  VERIFIED: "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800/80",
  ACTIVE: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/80",
  NOTICE_GIVEN: "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/80",
  MOVED_OUT: "bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800",
  ARCHIVED: "bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800",
  REJECTED: "bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800/80",
};

export function StudentStatusBadge({ status, className }: { status: string; className?: string }) {
  const isPulse = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase border shadow-sm",
        COLORS[status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", isPulse && "animate-pulse")} />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

