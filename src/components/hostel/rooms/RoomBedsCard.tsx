import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  BedDouble,
  BedSingle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  LayoutGrid,
  List,
  Search,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { describeBedRestriction } from "@/lib/bed-label";
import type { BedStatusValue, StructureBed } from "@/lib/rooms-beds";
import { cn } from "@/lib/utils";

export interface BedOccupant {
  studentId: string;
  name: string;
  detail: string | null;
}

const STATUS: Record<
  BedStatusValue,
  { label: string; icon: LucideIcon; pill: string; dot: string; card: string }
> = {
  OCCUPIED: {
    label: "Occupied",
    icon: CircleCheck,
    pill: "bg-success/10 text-success",
    dot: "bg-success",
    card: "border-success/30",
  },
  VACANT: {
    label: "Vacant",
    icon: BedSingle,
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
    card: "border-border/80",
  },
  MAINTENANCE: {
    label: "Maintenance",
    icon: Wrench,
    pill: "bg-warning/10 text-warning",
    dot: "bg-warning",
    card: "border-warning/30",
  },
  BLOCKED: {
    label: "Blocked",
    icon: Ban,
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    card: "border-destructive/30",
  },
};
const FILTERS: (BedStatusValue | "ALL")[] = ["ALL", "VACANT", "OCCUPIED", "MAINTENANCE", "BLOCKED"];
/** Two rows of four cards, or ten list rows, per page. */
const GRID_PAGE = 8;
const LIST_PAGE = 10;

function StatusPill({ status }: { status: BedStatusValue }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        s.pill,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** What a bed card/row says about its occupant or restriction. */
function bedBody(bed: StructureBed, occupant: BedOccupant | undefined) {
  if (bed.status === "OCCUPIED") {
    return {
      icon: UserRound,
      title: occupant?.name ?? "Occupied",
      detail: occupant ? occupant.detail : "No active allocation on record",
    };
  }
  if (bed.status === "MAINTENANCE") {
    return {
      icon: Wrench,
      title: "Under maintenance",
      detail: describeBedRestriction({
        status: bed.status,
        notes: bed.notes,
        maintenanceUntil: bed.maintenance_until,
      }),
    };
  }
  if (bed.status === "BLOCKED") {
    return {
      icon: Ban,
      title: "Blocked",
      detail: describeBedRestriction({ status: bed.status, notes: bed.notes }),
    };
  }
  return { icon: BedDouble, title: "No student yet", detail: "Ready to allot" };
}

/**
 * Beds of the selected room. Occupied beds open the student; vacant beds open
 * the allocation board; maintenance / blocked beds open the status dialog
 * (when the user may change bed status).
 */
export function RoomBedsCard({
  roomNumber,
  beds,
  occupants,
  isLoadingOccupants,
  onManageBed,
}: {
  roomNumber: string | null;
  beds: StructureBed[];
  occupants: Map<string, BedOccupant>;
  isLoadingOccupants?: boolean;
  onManageBed?: (bed: StructureBed) => void;
}) {
  const [filter, setFilter] = useState<BedStatusValue | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const counts = (s: BedStatusValue | "ALL") =>
    s === "ALL" ? beds.length : beds.filter((b) => b.status === s).length;
  const term = q.trim().toLowerCase();
  const matching = beds
    .filter(
      (b) =>
        (filter === "ALL" || b.status === filter) &&
        (!term ||
          b.code.toLowerCase().includes(term) ||
          (occupants.get(b.id)?.name.toLowerCase().includes(term) ?? false)),
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  // Any change of room, filter or search starts again from page 1.
  const pageKey = `${roomNumber}|${filter}|${term}|${view}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const pageSize = view === "grid" ? GRID_PAGE : LIST_PAGE;
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = paging.key === pageKey ? Math.min(paging.page, pages - 1) : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });
  const shown = matching.slice(page * pageSize, page * pageSize + pageSize);

  const wrap = (bed: StructureBed, className: string, children: ReactNode) => {
    const occupant = occupants.get(bed.id);
    if (bed.status === "OCCUPIED" && occupant) {
      return (
        <Link
          key={bed.id}
          to="/admin/students/$id"
          params={{ id: occupant.studentId }}
          className={className}
          aria-label={`Bed ${bed.code}: ${occupant.name}`}
        >
          {children}
        </Link>
      );
    }
    if (bed.status === "VACANT") {
      return (
        <Link
          key={bed.id}
          to="/admin/allocations"
          className={className}
          aria-label={`Bed ${bed.code}: allocate`}
        >
          {children}
        </Link>
      );
    }
    if (onManageBed && bed.status !== "OCCUPIED") {
      return (
        <button
          key={bed.id}
          type="button"
          onClick={() => onManageBed(bed)}
          className={cn(className, "text-left")}
          aria-label={`Bed ${bed.code}: change status`}
        >
          {children}
        </button>
      );
    }
    return (
      <div key={bed.id} className={className}>
        {children}
      </div>
    );
  };

  const interactive =
    "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 lg:flex-row lg:items-center">
        <CardTitle className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-base font-semibold">
          <BedDouble className="h-5 w-5 text-primary" aria-hidden="true" />
          {roomNumber ? `Beds in Room ${roomNumber}` : "Beds"}
        </CardTitle>
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:justify-end">
          <div className="relative w-36 shrink-0 sm:w-40">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bed"
              aria-label="Search beds by code or student"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          <div
            className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]"
            role="radiogroup"
            aria-label="Filter beds by status"
          >
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f !== "ALL" ? (
                    <span
                      className={cn("h-2 w-2 rounded-full", STATUS[f].dot)}
                      aria-hidden="true"
                    />
                  ) : null}
                  {f === "ALL" ? "All" : STATUS[f].label} ({counts(f)})
                </button>
              );
            })}
          </div>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => (v === "grid" || v === "list") && setView(v)}
            className="shrink-0 rounded-xl border border-border p-0.5"
            aria-label="Layout"
          >
            <ToggleGroupItem value="grid" aria-label="Card view" className="h-7 w-7 rounded-lg p-0">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 rounded-lg p-0">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!roomNumber ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Pick a room to see its beds.
          </p>
        ) : matching.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {beds.length === 0 ? "This room has no beds." : "No beds match this filter."}
          </p>
        ) : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((bed) => {
              const s = STATUS[bed.status];
              const body = bedBody(bed, occupants.get(bed.id));
              const BodyIcon = body.icon;
              return wrap(
                bed,
                cn("flex flex-col rounded-xl border bg-card p-3.5", s.card, interactive),
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <BedDouble className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {bed.code}
                    </span>
                    <StatusPill status={bed.status} />
                  </span>
                  <span className="mt-3 flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <BodyIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {bed.status === "OCCUPIED" && isLoadingOccupants ? (
                        <Skeleton className="h-4 w-24" />
                      ) : (
                        <span className="block truncate text-sm font-medium text-foreground">
                          {body.title}
                        </span>
                      )}
                      {body.detail ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {body.detail}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </span>
                </>,
              );
            })}
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/80">
            {shown.map((bed) => {
              const body = bedBody(bed, occupants.get(bed.id));
              return (
                <li key={bed.id}>
                  {wrap(
                    bed,
                    cn("flex w-full items-center gap-3 px-3.5 py-2.5", interactive),
                    <>
                      <span className="w-14 shrink-0 font-semibold text-foreground">
                        {bed.code}
                      </span>
                      <span className="w-32 shrink-0">
                        <StatusPill status={bed.status} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {body.title}
                        {body.detail ? (
                          <span className="text-muted-foreground"> · {body.detail}</span>
                        ) : null}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </>,
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {roomNumber && matching.length > pageSize ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {page * pageSize + 1}–{Math.min(matching.length, (page + 1) * pageSize)} of{" "}
              {matching.length} beds
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous beds"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-1 tabular-nums">
                {page + 1} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next beds"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
