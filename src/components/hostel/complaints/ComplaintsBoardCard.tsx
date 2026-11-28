import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  Flame,
  MoreHorizontal,
  Pencil,
  UserRound,
  X,
} from "lucide-react";

import {
  ComplaintCategoryChip,
  ComplaintNumberPill,
  ComplaintPriorityPill,
  ComplaintSlaPill,
  ComplaintStatusPill,
} from "@/components/hostel/complaints/ComplaintBadges";
import {
  SLA_TONE,
  TARGET_LABEL,
  useStatusTargets,
  type StatusTarget,
} from "@/components/hostel/complaints/complaint-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COMPLAINT_PAGE,
  SORTS,
  SORT_LABEL,
  STATUS_FILTERS,
  complaintSla,
  formatRaised,
  useComplaintCount,
  useKanbanColumn,
  usePropertyComplaintsPage,
  type ComplaintFilters,
  type ComplaintSort,
  type PropertyComplaint,
  type StatusFilter,
} from "@/lib/property-complaints";
import { cn } from "@/lib/utils";

export interface BoardActions {
  onOpen: (c: PropertyComplaint) => void;
  onEdit: (c: PropertyComplaint) => void;
  onStatus: (c: PropertyComplaint, target: StatusTarget) => void;
}

function studentLine(c: PropertyComplaint) {
  const who = c.is_anonymous ? "Anonymous student" : (c.student_full_name ?? "—");
  return c.room_number ? `${who} · ${c.room_number}` : who;
}

/**
 * One column template for the header and every row, so columns line up down the list. Sized by
 * the list's own width (the 2xl side column narrows it): from 56rem every field has its own
 * column; from 46rem priority and status share one; narrower lists show each complaint as a card.
 */
const ROW_GRID =
  "@[46rem]:grid @[46rem]:grid-cols-[100px_minmax(0,1fr)_132px_116px_164px_16px] @[46rem]:items-center @[46rem]:gap-x-3 @[56rem]:grid-cols-[100px_minmax(0,1fr)_132px_92px_116px_164px_16px]";

function ComplaintListHeader() {
  return (
    // The transparent border matches the rows' 4px accent / 1px borders, so labels sit over their cells.
    <div
      className={cn(
        "hidden border border-l-4 border-transparent px-3 pb-1.5 text-xs font-medium text-muted-foreground @[46rem]:grid",
        ROW_GRID,
      )}
      aria-hidden="true"
    >
      <span>Complaint</span>
      <span>Details</span>
      <span>Category</span>
      <span className="@[56rem]:hidden">Priority / Status</span>
      <span className="hidden @[56rem]:block">Priority</span>
      <span className="hidden @[56rem]:block">Status</span>
      <span>Raised / SLA</span>
      <span />
    </div>
  );
}

function ComplaintRow({ c, onOpen }: { c: PropertyComplaint; onOpen: BoardActions["onOpen"] }) {
  const tone = complaintSla(c).tone;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(c)}
        aria-label={`Open ${c.complaint_number}: ${c.title}`}
        className={cn(
          "relative flex w-full flex-col items-start gap-2 rounded-xl border border-l-4 border-border/80 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          ROW_GRID,
          SLA_TONE[tone].accent,
        )}
      >
        <span className="flex min-w-0 max-w-full pr-6 @[46rem]:pr-0">
          <ComplaintNumberPill number={c.complaint_number} />
        </span>
        <span className="block w-full min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground" title={c.title}>
            {c.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{studentLine(c)}</span>
          </span>
        </span>
        {/* Cards: one wrapping row of chips. Grid: each chip (group) becomes its own cell. */}
        <span className="flex max-w-full flex-wrap items-center gap-1.5 @[46rem]:contents">
          <span className="flex min-w-0 max-w-full">
            <ComplaintCategoryChip name={c.category_name} />
          </span>
          <span className="contents @[46rem]:flex @[46rem]:min-w-0 @[46rem]:flex-col @[46rem]:items-start @[46rem]:gap-1 @[56rem]:contents">
            <span className="flex min-w-0 max-w-full">
              <ComplaintPriorityPill priority={c.priority} />
            </span>
            <span className="flex min-w-0 max-w-full">
              <ComplaintStatusPill status={c.status} />
            </span>
          </span>
        </span>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1 @[46rem]:flex-col @[46rem]:items-start">
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
            <CalendarClock
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {formatRaised(c.created_at)}
          </span>
          <span className="flex min-w-0 max-w-full">
            <ComplaintSlaPill complaint={c} />
          </span>
        </span>
        <ChevronRight
          className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground @[46rem]:static"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

function ComplaintsList({
  filters,
  listQ,
  page,
  setPage,
  actions,
}: {
  filters: ComplaintFilters;
  listQ: ReturnType<typeof usePropertyComplaintsPage>;
  page: number;
  setPage: (n: number) => void;
  actions: BoardActions;
}) {
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / COMPLAINT_PAGE));

  const filtered =
    !!filters.q ||
    filters.status !== "ALL" ||
    filters.categoryId !== "ALL" ||
    filters.blockId !== "ALL" ||
    filters.urgentOnly;

  if (listQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (listQ.isError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn’t load complaints right now. Please try again.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => listQ.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <CircleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">
          {filtered ? "No complaints match" : "No complaints yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Try another search, status, category or block."
            : "Complaints raised by residents (or by you) show up here."}
        </p>
      </div>
    );
  }
  return (
    <>
      {/* Header + rows switch to the shared column grid by the list's own width
          (the 2xl side column narrows it). */}
      <div className="@container mb-4">
        <ComplaintListHeader />
        <ul className={cn("space-y-2", listQ.isFetching && "opacity-70")}>
          {rows.map((c) => (
            <ComplaintRow key={c.id} c={c} onOpen={actions.onOpen} />
          ))}
        </ul>
      </div>
      {total > COMPLAINT_PAGE ? (
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {page * COMPLAINT_PAGE + 1}–{Math.min(total, (page + 1) * COMPLAINT_PAGE)} of{" "}
            {total.toLocaleString("en-IN")} complaints
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              aria-label="Previous complaints"
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
              aria-label="Next complaints"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function KanbanCard({ c, actions }: { c: PropertyComplaint; actions: BoardActions }) {
  const targets = useStatusTargets(c);
  return (
    <li
      className={cn(
        "rounded-xl border border-l-4 border-border/80 bg-card shadow-sm",
        SLA_TONE[complaintSla(c).tone].accent,
      )}
    >
      <button
        type="button"
        onClick={() => actions.onOpen(c)}
        className="w-full space-y-2 rounded-t-xl p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between gap-2">
          <ComplaintNumberPill number={c.complaint_number} />
          <ComplaintPriorityPill priority={c.priority} />
        </div>
        <p className="line-clamp-2 text-sm font-semibold text-foreground">{c.title}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{studentLine(c)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ComplaintCategoryChip name={c.category_name} />
          <ComplaintSlaPill complaint={c} />
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{formatRaised(c.created_at)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Actions for ${c.complaint_number}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => actions.onOpen(c)}>
              <Eye className="h-4 w-4" /> View details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onEdit(c)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            {targets.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Change status
                </DropdownMenuLabel>
                {targets.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => actions.onStatus(c, t)}>
                    <ArrowRightLeft className="h-4 w-4" /> {TARGET_LABEL[t]}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function KanbanColumn({
  filters,
  group,
  sort,
  actions,
}: {
  filters: ComplaintFilters;
  group: Exclude<StatusFilter, "ALL">;
  sort: ComplaintSort;
  actions: BoardActions;
}) {
  const key = JSON.stringify([filters, sort]);
  const [state, setState] = useState({ key, limit: COMPLAINT_PAGE });
  const limit = state.key === key ? state.limit : COMPLAINT_PAGE;
  const colQ = useKanbanColumn(filters, group, sort, limit);
  const rows = colQ.data?.rows ?? [];
  const total = colQ.data?.total ?? 0;

  return (
    <section
      className="flex min-h-[200px] flex-col rounded-2xl border border-border/80 bg-muted/30 p-2.5"
      aria-label={`${group} complaints`}
    >
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <ComplaintStatusPill status={group} />
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
          {colQ.isLoading ? "…" : total.toLocaleString("en-IN")}
        </span>
      </header>
      {colQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : colQ.isError ? (
        <div className="py-6 text-center">
          <p className="text-xs text-muted-foreground">Couldn’t load this column.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => colQ.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className={cn("space-y-2", colQ.isFetching && "opacity-70")}>
          {rows.map((c) => (
            <KanbanCard key={c.id} c={c} actions={actions} />
          ))}
        </ul>
      )}
      {rows.length < total ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          disabled={colQ.isFetching}
          onClick={() => setState({ key, limit: limit + COMPLAINT_PAGE })}
        >
          Load more ({(total - rows.length).toLocaleString("en-IN")} left)
        </Button>
      ) : null}
    </section>
  );
}

/**
 * The main "Complaints (n)" card: sort, and either the paged list (8 per page from the database)
 * or the Kanban board (one column per status, 8 at a time with Load more).
 */
export function ComplaintsBoardCard({
  filters,
  view,
  sort,
  onSortChange,
  onClearUrgent,
  actions,
}: {
  filters: ComplaintFilters;
  view: "list" | "kanban";
  sort: ComplaintSort;
  onSortChange: (s: ComplaintSort) => void;
  onClearUrgent: () => void;
  actions: BoardActions;
}) {
  const pageKey = JSON.stringify([filters, sort]);
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const listQ = usePropertyComplaintsPage(filters, sort, page, view === "list");
  // The total can shrink under the current page (a complaint resolved here or by someone else, a
  // realtime refresh): step back to the last page that still has rows instead of an empty page.
  const loadedTotal = listQ.isPlaceholderData ? undefined : listQ.data?.total;
  useEffect(() => {
    if (loadedTotal === undefined || page === 0 || page * COMPLAINT_PAGE < loadedTotal) return;
    setPaging({ key: pageKey, page: Math.max(0, Math.ceil(loadedTotal / COMPLAINT_PAGE) - 1) });
  }, [loadedTotal, page, pageKey]);
  const countQ = useComplaintCount(filters, view === "kanban");
  const total = view === "list" ? listQ.data?.total : countQ.data;
  const groups = (filters.status === "ALL" ? STATUS_FILTERS.slice(1) : [filters.status]).filter(
    (g): g is Exclude<StatusFilter, "ALL"> => g !== "ALL",
  );

  return (
    <Card className="flex flex-1 flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <CircleAlert className="h-5 w-5 text-primary" aria-hidden="true" />
            Complaints{total !== undefined ? ` (${total.toLocaleString("en-IN")})` : ""}
          </CardTitle>
          {filters.urgentOnly ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-destructive">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              Open urgent &amp; high
              <button
                type="button"
                onClick={onClearUrgent}
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Show all priorities"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
        </div>
        <Select value={sort} onValueChange={(v) => onSortChange(v as ComplaintSort)}>
          <SelectTrigger className="h-9 w-auto gap-1.5 rounded-xl text-sm" aria-label="Sort">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {view === "list" ? (
          <ComplaintsList
            filters={filters}
            listQ={listQ}
            page={page}
            setPage={(n) => setPaging({ key: pageKey, page: n })}
            actions={actions}
          />
        ) : (
          <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1">
            {groups.map((g) => (
              <KanbanColumn key={g} filters={filters} group={g} sort={sort} actions={actions} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
