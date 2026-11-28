import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CircleAlert, RotateCw, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ROSTER_PAGE,
  TODAY_STATUS_META,
  TODAY_STATUS_ORDER,
  avatarTone,
  formatClock,
  formatDay,
  initials,
  useTodayAttendanceRoster,
  type TodayStatus,
} from "@/lib/property-attendance";
import { usePropertyRoomsStructure } from "@/lib/rooms-beds";
import { cn, toneClasses } from "@/lib/utils";

const ALL = "ALL";

function TodayStatusPill({ status, remark }: { status: TodayStatus; remark: string | null }) {
  const meta = TODAY_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[meta.tone],
      )}
      title={remark ? `Remark: ${remark}` : undefined}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const triggerClass =
  "h-9 w-full min-w-0 gap-2 rounded-xl text-xs sm:w-auto sm:min-w-[118px] sm:shrink-0 sm:text-sm";

/** Longest search the roster server fn accepts (rosterInput.q). */
const SEARCH_MAX = 80;

/**
 * Today's attendance of every active resident (Not marked included): block /
 * floor / status filters and name search applied on the server, 8 rows per
 * page, each row's bed, roll-call time and today's gate exit.
 */
export function TodayAttendanceCard({
  propertyId,
  date,
}: {
  propertyId: string;
  /** Property-local "YYYY-MM-DD", for the header while the roster loads. */
  date?: string;
}) {
  const [search, setSearch] = useState("");
  const [blockId, setBlockId] = useState<string>(ALL);
  const [floorId, setFloorId] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const q = useDebouncedValue(search.trim().slice(0, SEARCH_MAX), 300);

  const structureQ = usePropertyRoomsStructure(propertyId);
  const blocks = useMemo(() => structureQ.data?.blocks ?? [], [structureQ.data]);
  // Block / floor options failed to load: keep both selects visible but locked, with a retry chip.
  const structureFailed = structureQ.isError;
  const floors = useMemo(() => {
    const all = structureQ.data?.floors ?? [];
    const names = new Map(blocks.map((b) => [b.id, b.name]));
    return all
      .filter((f) => blockId === ALL || f.block_id === blockId)
      .map((f) => ({
        id: f.id,
        label:
          blockId === ALL && blocks.length > 1 && f.block_id && names.has(f.block_id)
            ? `${names.get(f.block_id)} · ${f.name}`
            : f.name,
      }));
  }, [structureQ.data, blocks, blockId]);

  const statusFilter = TODAY_STATUS_ORDER.find((s) => s === status) ?? null;
  const filters = {
    blockId: blockId === ALL ? null : blockId,
    floorId: floorId === ALL ? null : floorId,
    status: statusFilter,
    q,
  };
  const pageKey = `${q}|${blockId}|${floorId}|${status}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });

  const rosterQ = useTodayAttendanceRoster(propertyId, filters, page);
  const rows = rosterQ.data?.rows ?? [];
  const total = rosterQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ROSTER_PAGE));
  const tz = rosterQ.data?.timeZone ?? "Asia/Kolkata";
  const day = rosterQ.data?.date ?? date;
  const isFiltered = !!q || blockId !== ALL || floorId !== ALL || status !== ALL;
  const showBlockFilter = blocks.length > 0 || structureFailed;

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="space-y-3 pb-3 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:space-y-0">
        <CardTitle className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Today’s attendance
          {day ? (
            <span className="text-sm font-normal text-muted-foreground">· {formatDay(day)}</span>
          ) : null}
        </CardTitle>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center 2xl:flex-nowrap">
          {structureFailed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-span-2 h-9 shrink-0 gap-1.5 rounded-xl text-xs text-destructive sm:text-sm"
              disabled={structureQ.isFetching}
              onClick={() => structureQ.refetch()}
              title="Block and floor filters couldn’t load"
            >
              {structureQ.isFetching ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Filters unavailable · Try again
            </Button>
          ) : null}
          {showBlockFilter ? (
            <Select
              value={blockId}
              disabled={structureFailed}
              onValueChange={(v) => {
                setBlockId(v);
                setFloorId(ALL);
              }}
            >
              <SelectTrigger className={triggerClass} aria-label="Filter by block">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All blocks</SelectItem>
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={floorId}
            onValueChange={setFloorId}
            disabled={structureQ.isLoading || structureFailed}
          >
            <SelectTrigger className={triggerClass} aria-label="Filter by floor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All floors</SelectItem>
              {floors.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              // Phones lay the filters out two per row: a third select takes the full row.
              className={cn(triggerClass, showBlockFilter && "col-span-2")}
              aria-label="Filter by status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All status</SelectItem>
              {TODAY_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {TODAY_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative col-span-2 w-full sm:w-60 sm:shrink-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={SEARCH_MAX}
              placeholder="Search resident…"
              aria-label="Search residents by name or admission ID"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rosterQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : rosterQ.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load today’s attendance right now. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => rosterQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {isFiltered ? "No residents match" : "No active residents"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFiltered
                ? "Try another name, block, floor or status."
                : "Residents appear here once they move in."}
            </p>
          </div>
        ) : (
          <div className={cn("overflow-x-auto", rosterQ.isFetching && "opacity-70")}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Room / Bed</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead title="When today’s attendance was marked Present or Late">
                    Check in
                  </TableHead>
                  <TableHead title="Latest gate exit today (and the return scan, if back)">
                    Check out
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {page * ROSTER_PAGE + i + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: r.id }}
                        className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary"
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                            avatarTone(r.id),
                          )}
                          aria-hidden="true"
                        >
                          {initials(r.full_name)}
                        </span>
                        <span className="max-w-[170px] truncate">{r.full_name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.room ? (
                        `${r.room} / ${r.bed ?? "—"}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.block ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {r.checkInAt ? (
                        formatClock(r.checkInAt, tz)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {r.checkOutAt ? (
                        <div>
                          <span>{formatClock(r.checkOutAt, tz)}</span>
                          {r.backAt ? (
                            <span className="block text-xs text-muted-foreground">
                              Back {formatClock(r.backAt, tz)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TodayStatusPill status={r.status} remark={r.remark} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: r.id }}
                        aria-label={`Open ${r.full_name}`}
                        className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > ROSTER_PAGE ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {page * ROSTER_PAGE + 1}–{Math.min(total, (page + 1) * ROSTER_PAGE)} of{" "}
              {total.toLocaleString("en-IN")} residents
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous residents"
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
                aria-label="Next residents"
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
