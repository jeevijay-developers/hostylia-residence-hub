import { useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Megaphone,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";

import {
  AudienceCell,
  CategoryChip,
  CategoryIconTile,
  NoticeStatusPill,
  NoticeWhen,
  PriorityFlag,
} from "@/components/hostel/notices/NoticeBadges";
import {
  AUDIENCE_LABEL,
  CATEGORY_META,
  type NoticeListFilters,
} from "@/components/hostel/notices/notice-meta";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { NOTICE_CATEGORIES, isNoticeCategory, type NoticeCategory } from "@/lib/notice-defaults";
import { useNowTick } from "@/lib/notice-time";
import {
  NOTICE_AUDIENCES,
  NOTICE_FILTERS,
  NOTICE_PAGE,
  canRestoreNotice,
  isNoticeAudience,
  noticePhase,
  useNoticeList,
  type NoticeAudience,
  type NoticeCounts,
  type NoticeFilter,
  type NoticePhase,
  type PropertyNotice,
} from "@/lib/property-notices";
import { cn } from "@/lib/utils";

const FILTER_LABEL: Record<NoticeFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  ARCHIVED: "Archived",
};
const FILTER_COUNT: Record<NoticeFilter, (c: NoticeCounts) => number> = {
  ALL: (c) => c.total,
  ACTIVE: (c) => c.active,
  SCHEDULED: (c) => c.scheduled,
  ARCHIVED: (c) => c.archived,
};

export interface NoticeActions {
  onEdit: (n: PropertyNotice) => void;
  onArchive: (n: PropertyNotice) => void;
  onRestore: (n: PropertyNotice) => void;
  onDelete: (n: PropertyNotice) => void;
}

/**
 * The Notices toolbar: search (title, message), phase chips with counts, category and audience filters and
 * the list/grid toggle. One row from xl up; on phones (always cards, so no toggle) it stacks as search, chips,
 * then filters.
 */
export function NoticesToolbar({
  value,
  onChange,
  counts,
}: {
  value: NoticeListFilters;
  onChange: (patch: Partial<NoticeListFilters>) => void;
  counts?: NoticeCounts;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      <div className="relative order-1 min-w-0 flex-1 sm:order-none sm:min-w-[200px] sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={value.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search notices…"
          aria-label="Search notices by title or message"
          className="h-9 rounded-xl pl-9 text-sm"
        />
      </div>
      <div
        className="order-3 flex w-full min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto"
        role="radiogroup"
        aria-label="Filter notices by status"
      >
        {NOTICE_FILTERS.map((f) => {
          const on = value.filter === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ filter: f })}
              className={cn(
                "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {FILTER_LABEL[f]}
              {counts ? ` (${FILTER_COUNT[f](counts).toLocaleString("en-IN")})` : ""}
            </button>
          );
        })}
      </div>
      <div className="order-4 grid w-full grid-cols-2 gap-2 sm:order-none sm:ml-auto sm:flex sm:w-auto sm:shrink-0">
        <Select
          value={value.category}
          onValueChange={(v) =>
            onChange({ category: v === "ALL" || !isNoticeCategory(v) ? "ALL" : v })
          }
        >
          <SelectTrigger
            className="h-9 min-w-0 rounded-xl text-sm sm:w-[150px]"
            aria-label="Category"
          >
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {NOTICE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_META[c].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value.audience ?? "ANY"}
          onValueChange={(v) => onChange({ audience: isNoticeAudience(v) ? v : null })}
        >
          <SelectTrigger
            className="h-9 min-w-0 rounded-xl text-sm sm:w-[150px]"
            aria-label="Audience"
          >
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ANY">All audiences</SelectItem>
            {NOTICE_AUDIENCES.map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIENCE_LABEL[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className="order-2 hidden shrink-0 rounded-xl border border-border p-0.5 sm:order-none md:flex"
        role="radiogroup"
        aria-label="Layout"
      >
        {(
          [
            { v: "grid", icon: LayoutGrid, label: "Grid view" },
            { v: "list", icon: List, label: "List view" },
          ] as const
        ).map(({ v, icon: Icon, label }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value.view === v}
            aria-label={label}
            onClick={() => onChange({ view: v })}
            className={cn(
              "grid h-7 w-8 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value.view === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The property's notices for the toolbar's filters, as a list or grid, 8 per page from the database. Phones
 * always get the cards: a five-column table would only scroll sideways there.
 */
export function NoticesTableCard({
  propertyId,
  filters,
  actions,
}: {
  propertyId: string;
  filters: NoticeListFilters;
  actions: NoticeActions;
}) {
  const { filter, category, audience, view } = filters;
  const q = useDebouncedValue(filters.search.trim(), 300);
  const pageKey = `${q}|${filter}|${category}|${audience}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  // Any filter change starts again at page 1 (also when it comes back to an earlier combination).
  if (paging.key !== pageKey) setPaging({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });
  const now = useNowTick(30_000);
  const isMobile = useIsMobile();

  const listQ = useNoticeList(propertyId, { q, filter, category, audience, page });
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / NOTICE_PAGE));
  // Archive / Delete / Restore can shrink the list under the current page: move back to the last page
  // that still has notices once the fresh count is in (placeholder data still belongs to the old query).
  const lastPage = pages - 1;
  const pageOutOfRange = !!listQ.data && !listQ.isPlaceholderData && page > lastPage;
  useEffect(() => {
    if (pageOutOfRange) setPaging({ key: pageKey, page: lastPage });
  }, [pageOutOfRange, pageKey, lastPage]);
  const shownPage = Math.min(page, lastPage);
  const filtered = !!q || filter !== "ALL" || category !== "ALL" || audience !== null;

  return (
    <Card className="flex h-full min-w-0 flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardContent className="flex flex-1 flex-col p-3 sm:p-4">
        {listQ.isLoading || pageOutOfRange ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : listQ.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load notices right now. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => listQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Megaphone className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {filtered ? "No notices match" : "No notices yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered
                ? "Try another search, status, category or audience."
                : "Create a notice to tell residents what's happening."}
            </p>
          </div>
        ) : view === "list" && !isMobile ? (
          <div className={cn("overflow-x-auto", listQ.isFetching && "opacity-70")}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Notice</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Published on</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n) => {
                  const phase = noticePhase(n, now);
                  return (
                    <TableRow key={n.id}>
                      {/* w-full + max-w-0: this column takes the spare width and its text truncates
                          inside it, so the other columns never get pushed out of the card. */}
                      <TableCell className="w-full min-w-[240px] max-w-0">
                        <div className="flex items-center gap-3">
                          <CategoryIconTile category={n.category} />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => actions.onEdit(n)}
                                className="min-w-0 truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                                title={n.title}
                              >
                                {n.title}
                              </button>
                              <PriorityFlag priority={n.priority} />
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <CategoryChip category={n.category} />
                      </TableCell>
                      <TableCell>
                        <AudienceCell notice={n} />
                      </TableCell>
                      <TableCell>
                        <NoticeWhen notice={n} phase={phase} />
                      </TableCell>
                      <TableCell>
                        <NoticeStatusPill notice={n} phase={phase} />
                      </TableCell>
                      <TableCell>
                        <NoticeRowMenu notice={n} phase={phase} actions={actions} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-1 gap-3 md:grid-cols-2",
              listQ.isFetching && "opacity-70",
            )}
          >
            {rows.map((n) => {
              const phase = noticePhase(n, now);
              return (
                <article
                  key={n.id}
                  className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <CategoryIconTile category={n.category} />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => actions.onEdit(n)}
                        className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                      >
                        {n.title}
                      </button>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    </div>
                    <NoticeRowMenu notice={n} phase={phase} actions={actions} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryChip category={n.category} />
                    <NoticeStatusPill notice={n} phase={phase} />
                    <PriorityFlag priority={n.priority} />
                  </div>
                  {/* mt-auto: footers line up across a grid row. Phones stack audience over date; wider
                      cards keep the date on the right, also when it wraps under the audience. */}
                  <div className="mt-auto flex flex-col gap-1.5 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-3">
                    <AudienceCell notice={n} />
                    <NoticeWhen notice={n} phase={phase} className="sm:ml-auto sm:text-right" />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {total > NOTICE_PAGE ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {shownPage * NOTICE_PAGE + 1}–{Math.min(total, (shownPage + 1) * NOTICE_PAGE)} of{" "}
              {total.toLocaleString("en-IN")} notices
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={shownPage === 0}
                onClick={() => setPage(shownPage - 1)}
                aria-label="Previous notices"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-1 tabular-nums">
                {shownPage + 1} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={shownPage + 1 >= pages}
                onClick={() => setPage(shownPage + 1)}
                aria-label="Next notices"
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

function NoticeRowMenu({
  notice,
  phase,
  actions,
}: {
  notice: PropertyNotice;
  phase: NoticePhase;
  actions: NoticeActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label={`Actions for ${notice.title}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => actions.onEdit(notice)}>
          <Pencil className="h-4 w-4" /> Edit
        </DropdownMenuItem>
        {phase !== "ARCHIVED" ? (
          <DropdownMenuItem onClick={() => actions.onArchive(notice)}>
            <Archive className="h-4 w-4" /> {phase === "SCHEDULED" ? "Archive (cancel)" : "Archive"}
          </DropdownMenuItem>
        ) : null}
        {canRestoreNotice(notice, phase) ? (
          <DropdownMenuItem onClick={() => actions.onRestore(notice)}>
            <ArchiveRestore className="h-4 w-4" /> Restore
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => actions.onDelete(notice)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
