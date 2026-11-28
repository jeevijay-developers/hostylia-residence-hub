import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  EllipsisVertical,
  KeyRound,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DESIGNATION_LABEL,
  STAFF_DESIGNATIONS,
  STAFF_PAGE,
  asDesignation,
  effectiveStaffStatus,
  formatStaffPhone,
  shiftLabel,
  useStaffDirectory,
  type LoginStaff,
  type RosterStaff,
  type StaffDesignation,
  type StaffFilter,
  type StaffStatus,
} from "@/lib/property-staff";
import { cn } from "@/lib/utils";
import {
  DesignationChip,
  LoginBadge,
  StaffAvatar,
  StaffStatusPill,
  type StaffPillStatus,
} from "./staff-display";

/** `num` is the row's position in the paged list; unlinked logins shown above the roster have none. */
type Entry =
  | { kind: "roster"; key: string; num: number; staff: RosterStaff }
  | { kind: "login"; key: string; num: number | null; login: LoginStaff };

interface EntryView {
  id: string;
  name: string;
  email: string | null;
  designation: StaffDesignation;
  phone: string | null;
  place: string | null;
  shift: string | null;
  status: StaffPillStatus;
  hasLogin: boolean;
  loginOnly: boolean;
}

const STATUS_FILTERS: { value: StaffStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All status" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "INACTIVE", label: "Inactive" },
];

export interface StaffRowActions {
  onEdit: (s: RosterStaff) => void;
  onStatus: (s: RosterStaff, status: StaffStatus) => void;
  onRemove: (s: RosterStaff) => void;
  onAddFromLogin: (l: LoginStaff) => void;
}

function loginMatches(l: LoginStaff, f: StaffFilter) {
  const role = asDesignation(String(l.role));
  if (f.designation !== "ALL" && f.designation !== role) return false;
  if (f.status === "ON_LEAVE" || f.status === "INACTIVE") return false;
  if (f.status === "ACTIVE" && !l.is_active) return false;
  const term = f.q.trim().toLowerCase();
  if (!term) return true;
  const digits = term.replace(/\D/g, "");
  const p = l.profile;
  return (
    (p?.full_name ?? "").toLowerCase().includes(term) ||
    (p?.email ?? "").toLowerCase().includes(term) ||
    (digits.length >= 3 && (p?.phone ?? "").replace(/\D/g, "").includes(digits))
  );
}

/**
 * The property's staff directory: search (name / phone / email), role and status
 * filters, list or grid view, 8 roster rows per page from the database.
 * App logins for this property that aren't on the roster yet are listed on the
 * first page with a "Login" badge and an "Add to roster" action.
 */
export function StaffDirectoryCard({
  propertyId,
  leaveToday,
  logins,
  isLoadingLogins,
  loginsError,
  onRetryLogins,
  blockNames,
  actions,
}: {
  propertyId: string;
  /** Ids of staff with an On leave mark today; `null` while that is still loading. */
  leaveToday: readonly string[] | null;
  /** Logins not linked to any roster row. */
  logins: LoginStaff[];
  isLoadingLogins?: boolean;
  /** The login list failed to load (the roster still shows; a retry line is offered). */
  loginsError?: boolean;
  onRetryLogins?: () => void;
  blockNames: Map<string, string>;
  actions: StaffRowActions;
}) {
  const [search, setSearch] = useState("");
  const [designation, setDesignation] = useState<StaffDesignation | "ALL">("ALL");
  const [status, setStatus] = useState<StaffStatus | "ALL">("ALL");
  const [view, setView] = useState<"list" | "grid">("list");
  const q = useDebouncedValue(search.trim(), 300);
  const pageKey = `${q}|${designation}|${status}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });

  const filter: StaffFilter = { q, designation, status };
  const dirQ = useStaffDirectory(propertyId, { ...filter, page, leaveToday });
  const onLeaveToday = useMemo(() => new Set(leaveToday ?? []), [leaveToday]);

  const matchedLogins = useMemo(
    () => logins.filter((l) => loginMatches(l, { q, designation, status })),
    [logins, q, designation, status],
  );

  const roster = dirQ.data ?? null;
  const rosterTotal = roster?.total;
  const total = rosterTotal ?? 0;
  const pages = Math.max(1, Math.ceil(total / STAFF_PAGE));
  const isPlaceholder = dirQ.isPlaceholderData;
  // A write (remove / status change under a status filter) can shrink the list so
  // the current page falls past the end: clamp it instead of showing an empty page.
  useEffect(() => {
    if (rosterTotal === undefined || isPlaceholder) return;
    if (page > 0 && page * STAFF_PAGE >= rosterTotal) {
      setPaging({ key: pageKey, page: Math.max(0, Math.ceil(rosterTotal / STAFF_PAGE) - 1) });
    }
  }, [rosterTotal, isPlaceholder, page, pageKey]);

  let entries: Entry[] = [];
  // Unlinked logins listed above the roster on page 1 (not counted in `total`).
  let extraLogins = 0;
  if (roster) {
    const extra: Entry[] =
      page === 0
        ? matchedLogins.map((l) => ({ kind: "login", key: `l:${l.id}`, num: null, login: l }))
        : [];
    extraLogins = extra.length;
    entries = [
      ...extra,
      ...roster.rows.map((s, i): Entry => ({
        kind: "roster",
        key: s.id,
        num: page * STAFF_PAGE + i + 1,
        staff: s,
      })),
    ];
  }
  const filtered = q !== "" || designation !== "ALL" || status !== "ALL";
  // No roster rows but a non-zero total = an out-of-range page that is being clamped.
  const isSettling = !!roster && roster.rows.length === 0 && roster.total > 0;
  // isPending (not isLoading): the query waits, disabled, until today's leave is known.
  // Page 1 also waits for the unlinked logins so rows don't jump in later.
  const isLoading = dirQ.isPending || (page === 0 && !!isLoadingLogins) || isSettling;
  const isError = dirQ.isError;

  const viewOf = (e: Entry): EntryView => {
    if (e.kind === "roster") {
      const s = e.staff;
      return {
        id: s.id,
        name: s.full_name,
        email: s.email,
        designation: s.designation,
        phone: s.phone,
        place: s.block_id ? (blockNames.get(s.block_id) ?? "Block") : s.work_area,
        shift: shiftLabel(s),
        status: effectiveStaffStatus(s, onLeaveToday.has(s.id) ? "ON_LEAVE" : undefined),
        hasLogin: !!s.user_id,
        loginOnly: false,
      };
    }
    const l = e.login;
    return {
      id: l.id,
      name: l.profile?.full_name || l.profile?.email || "Unnamed login",
      email: l.profile?.email ?? null,
      designation: asDesignation(String(l.role)),
      phone: l.profile?.phone ?? null,
      place: l.block_id ? (blockNames.get(l.block_id) ?? "Block") : "All blocks",
      shift: null,
      status: l.is_active ? "ACTIVE" : "INVITED",
      hasLogin: true,
      loginOnly: true,
    };
  };

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <CardTitle className="flex shrink-0 items-center gap-2.5 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Staff directory
        </CardTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap xl:flex-1 xl:justify-end">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 xl:max-w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name, phone…"
              aria-label="Search staff by name, phone or email"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          <Select
            value={designation}
            onValueChange={(v) => setDesignation(v === "ALL" ? "ALL" : asDesignation(v))}
          >
            <SelectTrigger
              className="h-9 min-w-0 flex-1 rounded-xl text-sm sm:w-[132px] sm:flex-none sm:shrink-0"
              aria-label="Filter by role"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              {STAFF_DESIGNATIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {DESIGNATION_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) =>
              setStatus(STATUS_FILTERS.find((s) => s.value === v)?.value ?? "ALL")
            }
          >
            <SelectTrigger
              className="h-9 min-w-0 flex-1 rounded-xl text-sm sm:w-[124px] sm:flex-none sm:shrink-0"
              aria-label="Filter by status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="hidden shrink-0 items-center rounded-xl border border-border p-0.5 sm:flex"
            role="radiogroup"
            aria-label="Directory layout"
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
                aria-checked={view === v}
                aria-label={label}
                title={label}
                onClick={() => setView(v)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {loginsError && page === 0 && !isLoading && !isError ? (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
          >
            <span>Couldn’t load app logins that aren’t on the roster yet.</span>
            <Button variant="outline" size="sm" className="h-7" onClick={onRetryLogins}>
              Try again
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load staff right now. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => dirQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {filtered ? "No staff match" : "No staff yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered
                ? "Try another name, phone, role or status."
                : "Add your wardens, caretakers, security and other staff."}
            </p>
          </div>
        ) : (
          <div className={cn(dirQ.isFetching && "opacity-70")}>
            {/* Grid on phones always; list from sm when chosen. */}
            <div
              className={cn(
                "grid grid-cols-1 gap-3 md:grid-cols-2 min-[1700px]:grid-cols-3",
                view === "list" && "sm:hidden",
              )}
            >
              {entries.map((e) => (
                <StaffCardItem
                  key={e.key}
                  entry={e}
                  view={viewOf(e)}
                  isOnLeaveToday={e.kind === "roster" && onLeaveToday.has(e.staff.id)}
                  actions={actions}
                />
              ))}
            </div>
            {view === "list" ? (
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Staff member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Shift / Block</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-14 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => {
                      const v = viewOf(e);
                      return (
                        <TableRow key={e.key}>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {e.num ?? (
                              <span
                                aria-label="Not on the roster yet"
                                title="Not on the roster yet"
                              >
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <StaffAvatar id={v.id} name={v.name} />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 font-medium text-foreground">
                                  <span className="max-w-[180px] truncate" title={v.name}>
                                    {v.name}
                                  </span>
                                  {v.loginOnly ? (
                                    <LoginBadge hint="App login — not on the staff roster yet" />
                                  ) : v.hasLogin ? (
                                    <KeyRound
                                      className="h-3.5 w-3.5 shrink-0 text-info"
                                      aria-label="Has an app login"
                                    />
                                  ) : null}
                                </p>
                                {v.email ? (
                                  <p
                                    className="max-w-[220px] truncate text-xs text-muted-foreground"
                                    title={v.email}
                                  >
                                    {v.email}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <DesignationChip designation={v.designation} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {v.phone ? (
                              <span className="inline-flex items-center gap-1.5 text-foreground">
                                <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                                {formatStaffPhone(v.phone)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <p className="text-foreground">{v.place ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {v.shift ?? "No shift set"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <StaffStatusPill status={v.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RowMenu
                              entry={e}
                              name={v.name}
                              isOnLeaveToday={e.kind === "roster" && onLeaveToday.has(e.staff.id)}
                              actions={actions}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        )}

        {!isLoading && !isError && (total > STAFF_PAGE || page > 0) ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="min-w-0 tabular-nums">
              {total === 0 ? 0 : page * STAFF_PAGE + 1}–{Math.min(total, (page + 1) * STAFF_PAGE)}{" "}
              of {total.toLocaleString("en-IN")} staff
              {extraLogins > 0
                ? ` · ${extraLogins} login${extraLogins === 1 ? "" : "s"} not on roster`
                : ""}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous staff"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="whitespace-nowrap px-1 tabular-nums">
                {page + 1} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next staff"
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

function StaffCardItem({
  entry,
  view: v,
  isOnLeaveToday,
  actions,
}: {
  entry: Entry;
  view: EntryView;
  isOnLeaveToday: boolean;
  actions: StaffRowActions;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start gap-3">
        <StaffAvatar id={v.id} name={v.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-foreground">
            <span className="min-w-0 break-words">{v.name}</span>
            {v.loginOnly ? (
              <LoginBadge hint="App login — not on the staff roster yet" />
            ) : v.hasLogin ? (
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-info" aria-label="Has an app login" />
            ) : null}
          </p>
          {v.email ? (
            <p className="truncate text-xs text-muted-foreground" title={v.email}>
              {v.email}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DesignationChip designation={v.designation} />
            <StaffStatusPill status={v.status} />
          </div>
        </div>
        <RowMenu entry={entry} name={v.name} isOnLeaveToday={isOnLeaveToday} actions={actions} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 text-sm">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {v.phone ? formatStaffPhone(v.phone) : <span className="text-muted-foreground">—</span>}
        </span>
        <span className="inline-flex items-start gap-1.5 text-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {v.place ?? "—"}
            <span className="text-muted-foreground">
              {" · "}
              {v.shift ?? "No shift set"}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function RowMenu({
  entry,
  name,
  isOnLeaveToday,
  actions,
}: {
  entry: Entry;
  name: string;
  /** Active on the roster but on leave today via Leave requests (managed there). */
  isOnLeaveToday: boolean;
  actions: StaffRowActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={`Actions for ${name}`}
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {entry.kind === "login" ? (
          <>
            <DropdownMenuItem onSelect={() => actions.onAddFromLogin(entry.login)}>
              <UserPlus className="h-4 w-4" /> Add to roster
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/staff">
                <KeyRound className="h-4 w-4" /> Manage app access
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => actions.onEdit(entry.staff)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            {entry.staff.status === "ACTIVE" ? (
              isOnLeaveToday ? null : (
                <DropdownMenuItem onSelect={() => actions.onStatus(entry.staff, "ON_LEAVE")}>
                  <CalendarClock className="h-4 w-4" /> Mark on leave
                </DropdownMenuItem>
              )
            ) : (
              <DropdownMenuItem onSelect={() => actions.onStatus(entry.staff, "ACTIVE")}>
                <CircleCheck className="h-4 w-4" />{" "}
                {entry.staff.status === "ON_LEAVE" ? "Back to active" : "Reactivate"}
              </DropdownMenuItem>
            )}
            {entry.staff.status !== "INACTIVE" ? (
              <DropdownMenuItem onSelect={() => actions.onStatus(entry.staff, "INACTIVE")}>
                <CircleSlash className="h-4 w-4" /> Deactivate
              </DropdownMenuItem>
            ) : null}
            {entry.staff.user_id ? (
              <DropdownMenuItem asChild>
                <Link to="/admin/staff">
                  <KeyRound className="h-4 w-4" /> Manage app access
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => actions.onRemove(entry.staff)}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
