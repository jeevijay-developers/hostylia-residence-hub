import { useMemo } from "react";
import { Bed, CheckCircle2, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type BedStatus = "VACANT" | "OCCUPIED" | "BLOCKED" | "MAINTENANCE";

export interface BedTile {
  id: string;
  code: string;
  status: BedStatus;
  /** Full name of the student currently allocated to this bed, if any. */
  occupantName?: string | null;
}

const STATUS_META: Record<BedStatus, { className: string; label: string; Icon: typeof Bed }> = {
  VACANT: {
    className: "bg-bed-vacant/15 border-bed-vacant text-bed-vacant",
    label: "Vacant",
    Icon: Bed,
  },
  OCCUPIED: {
    className: "bg-bed-occupied/15 border-bed-occupied text-bed-occupied",
    label: "Occupied",
    Icon: CheckCircle2,
  },
  MAINTENANCE: {
    className: "bg-bed-maintenance/15 border-bed-maintenance text-bed-maintenance",
    label: "Maintenance",
    Icon: Wrench,
  },
  BLOCKED: {
    className: "bg-bed-blocked/15 border-bed-blocked text-bed-blocked",
    label: "Blocked",
    Icon: XCircle,
  },
};

interface BedGridProps {
  beds: BedTile[];
  onSelect?: (bed: BedTile) => void;
}

/**
 * Occupancy column signature visual per Design.md Sec 5 — colour + icon
 * always paired (never colour alone) to stay WCAG-compliant.
 */
export function BedGrid({ beds, onSelect }: BedGridProps) {
  const counts = useMemo(() => {
    const c: Record<BedStatus, number> = {
      VACANT: 0,
      OCCUPIED: 0,
      MAINTENANCE: 0,
      BLOCKED: 0,
    };
    beds.forEach((b) => (c[b.status] += 1));
    return c;
  }, [beds]);

  if (beds.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        No beds yet — set room capacity to generate beds.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.keys(STATUS_META) as BedStatus[]).map((s) => {
          const { className, label, Icon } = STATUS_META[s];
          return (
            <span
              key={s}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
                className,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}: {counts[s]}
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {beds.map((b) => {
          const { className, Icon, label } = STATUS_META[b.status];
          const title = b.occupantName
            ? `${b.code} — ${label} — ${b.occupantName}`
            : `${b.code} — ${label}`;
          return (
            <button
              key={b.id}
              onClick={() => onSelect?.(b)}
              title={title}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-2 py-2 text-xs font-medium transition hover:opacity-80",
                className,
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{b.code}</span>
              {b.occupantName ? (
                <span className="max-w-full truncate text-[10px] font-normal opacity-80">
                  {b.occupantName}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
