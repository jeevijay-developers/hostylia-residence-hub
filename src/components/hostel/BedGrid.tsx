import { useMemo, useState } from "react";
import { Bed, CheckCircle2, LayoutGrid, List, Search, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type BedStatus = "VACANT" | "OCCUPIED" | "BLOCKED" | "MAINTENANCE";

export interface BedTile {
  id: string;
  code: string;
  status: BedStatus;
  /** Full name of the student currently allocated to this bed, if any. */
  occupantName?: string | null;
  /** Room number this bed belongs to, if known — searchable alongside the bed code. */
  roomNumber?: string | null;
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

const STATUS_CARD_META: Record<
  BedStatus,
  {
    border: string;
    badge: string;
    text: string;
    label: string;
    caption: string;
    Icon: typeof Bed;
    glow: string;
  }
> = {
  VACANT: {
    border: "border-bed-vacant/40",
    badge: "bg-bed-vacant/15 text-bed-vacant",
    text: "text-bed-vacant",
    label: "Vacant",
    caption: "Available beds",
    Icon: Bed,
    glow: "var(--bed-vacant)",
  },
  OCCUPIED: {
    border: "border-bed-occupied/40",
    badge: "bg-bed-occupied/15 text-bed-occupied",
    text: "text-bed-occupied",
    label: "Occupied",
    caption: "Occupied beds",
    Icon: CheckCircle2,
    glow: "var(--bed-occupied)",
  },
  MAINTENANCE: {
    border: "border-bed-maintenance/40",
    badge: "bg-bed-maintenance/15 text-bed-maintenance",
    text: "text-bed-maintenance",
    label: "Maintenance",
    caption: "Under maintenance",
    Icon: Wrench,
    glow: "var(--bed-maintenance)",
  },
  BLOCKED: {
    border: "border-bed-blocked/40",
    badge: "bg-bed-blocked/15 text-bed-blocked",
    text: "text-bed-blocked",
    label: "Blocked",
    caption: "Currently blocked",
    Icon: XCircle,
    glow: "var(--bed-blocked)",
  },
};

interface BedGridProps {
  beds: BedTile[];
  onSelect?: (bed: BedTile) => void;
  /**
   * "compact" (default) keeps the dense pill-legend layout used when nesting a
   * grid inside a room row (property structure editor). "expanded" adds stat
   * cards, a search box and a grid/list toggle for a standalone board page.
   */
  variant?: "compact" | "expanded";
}

/**
 * Occupancy column signature visual per Design.md Sec 5 — colour + icon
 * always paired (never colour alone) to stay WCAG-compliant.
 */
export function BedGrid({ beds, onSelect, variant = "compact" }: BedGridProps) {
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

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const visibleBeds = useMemo(() => {
    if (!query.trim()) {
      // Room search (below) can surface any status so Occupied rooms stay
      // findable, but the default board is the bed *selection* list for new
      // allocations — only Available (VACANT) beds belong here.
      return variant === "expanded" ? beds.filter((b) => b.status === "VACANT") : beds;
    }
    const q = query.trim().toLowerCase();
    return beds.filter(
      (b) =>
        b.code.toLowerCase().includes(q) ||
        (b.roomNumber ?? "").toLowerCase().includes(q) ||
        (b.occupantName ?? "").toLowerCase().includes(q),
    );
  }, [beds, query, variant]);

  if (beds.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        No beds yet — set room capacity to generate beds.
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:gap-2.5">
          {(Object.keys(STATUS_META) as BedStatus[]).map((s) => {
            const { className, label, Icon } = STATUS_META[s];
            return (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 font-semibold shadow-sm sm:justify-start",
                  className,
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}: {counts[s]}
              </span>
            );
          })}
        </div>
        <BedTileGrid beds={beds} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(STATUS_CARD_META) as BedStatus[]).map((s) => {
          const meta = STATUS_CARD_META[s];
          const Icon = meta.Icon;
          return (
            <div
              key={s}
              className={cn(
                "rounded-2xl border bg-card p-4 shadow-card-ambient panel-lift",
                meta.border,
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-tone-glow",
                    meta.badge,
                  )}
                  style={{ ["--glow-tone" as string]: meta.glow }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className={cn("text-sm font-medium", meta.text)}>{meta.label}</span>
              </div>
              <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-foreground">
                {counts[s]}
              </p>
              <p className="text-xs text-muted-foreground">{meta.caption}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search rooms…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md transition",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md transition",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {visibleBeds.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          {query.trim() ? `No rooms match "${query}".` : "No available beds right now."}
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleBeds.map((b) => {
            const meta = STATUS_CARD_META[b.status];
            const Icon = meta.Icon;
            const title = b.occupantName
              ? `${b.code} — ${meta.label} — ${b.occupantName}`
              : `${b.code} — ${meta.label}`;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect?.(b)}
                title={title}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border-2 bg-card p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                  meta.border,
                )}
              >
                <span className={cn("grid h-9 w-9 place-items-center rounded-full", meta.badge)}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-display text-base font-semibold tabular-nums text-foreground">
                  {b.code}
                </span>
                <span
                  className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.badge)}
                >
                  {meta.label}
                </span>
                {b.occupantName ? (
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {b.occupantName}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {visibleBeds.map((b) => {
            const meta = STATUS_CARD_META[b.status];
            const Icon = meta.Icon;
            const title = b.occupantName
              ? `${b.code} — ${meta.label} — ${b.occupantName}`
              : `${b.code} — ${meta.label}`;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect?.(b)}
                title={title}
                className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-accent/40"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                    meta.badge,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-semibold tabular-nums text-foreground">
                    {b.code}
                  </span>
                  {b.occupantName ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.occupantName}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    meta.badge,
                  )}
                >
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BedTileGrid({ beds, onSelect }: { beds: BedTile[]; onSelect?: (bed: BedTile) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
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
              "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
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
  );
}
