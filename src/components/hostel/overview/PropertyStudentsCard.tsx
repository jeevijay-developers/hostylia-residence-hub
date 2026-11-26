import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  LayoutGrid,
  List,
  MoreVertical,
  Phone,
  Search,
  UserRound,
  Users,
} from "lucide-react";

import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;
const LIVE_STAY = ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION"];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "NOTICE_GIVEN", label: "Notice given" },
  { value: "VERIFIED", label: "Verified" },
  { value: "APPLICANT", label: "Applicant" },
  { value: "MOVED_OUT", label: "Moved out" },
];

interface StayEmbed {
  status: string;
  deleted_at: string | null;
  rooms: { room_number: string } | null;
  beds: { code: string } | null;
  blocks: { name: string } | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  admission_number: string;
  course_name: string | null;
  phone: string | null;
  status: string;
  stay: { room: string; bed: string; block: string | null } | null;
}

function toRow(r: {
  id: string;
  full_name: string;
  admission_number: string;
  course_name: string | null;
  phone: string | null;
  status: string;
  allocations: StayEmbed[] | null;
}): StudentRow {
  const live = (r.allocations ?? []).find((a) => !a.deleted_at && LIVE_STAY.includes(a.status));
  return {
    id: r.id,
    full_name: r.full_name,
    admission_number: r.admission_number,
    course_name: r.course_name,
    phone: r.phone,
    status: r.status,
    stay: live
      ? {
          room: live.rooms?.room_number ?? "—",
          bed: live.beds?.code ?? "—",
          block: live.blocks?.name ?? null,
        }
      : null,
  };
}

/** "+91 98290 11234" for Indian mobile numbers; anything else as stored. */
function formatPhone(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : phone;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

function StudentAvatar({ name }: { name: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      aria-hidden="true"
    >
      {initials(name) || <UserRound className="h-4 w-4" />}
    </span>
  );
}

function RowActions({ student }: { student: StudentRow }) {
  const canAllocate = ["ACTIVE", "VERIFIED", "NOTICE_GIVEN"].includes(student.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${student.full_name}`}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to="/admin/students/$id" params={{ id: student.id }}>
            <UserRound className="mr-2 h-4 w-4" /> View profile
          </Link>
        </DropdownMenuItem>
        {canAllocate ? (
          <DropdownMenuItem asChild>
            <Link to="/admin/allocations" search={{ student: student.id }}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {student.stay ? "Change room" : "Allocate a bed"}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {student.stay ? (
          <DropdownMenuItem asChild>
            <Link to="/admin/students/$id/move-out" params={{ id: student.id }}>
              <DoorOpen className="mr-2 h-4 w-4" /> Move out
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The property's students, searched, filtered and paged in the database (8
 * per page) — never the whole list in the browser. Room, bed and block come
 * from the student's current stay.
 */
export function PropertyStudentsCard({
  propertyId,
  blocks,
}: {
  propertyId: string;
  blocks: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [blockId, setBlockId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [view, setView] = useState<"list" | "grid">("list");
  const q = useDebouncedValue(search.trim(), 300);
  // Any filter change starts again from page 1.
  const filterKey = `${q}|${blockId}|${status}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const setPage = (p: number) => setPaging({ key: filterKey, page: p });

  const studentsQ = useQuery({
    queryKey: ["property-students", propertyId, q, blockId, status, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // PostgREST's or() syntax treats , ( ) as separators — keep them out of the term.
      const term = q.replace(/[,()*%\\]/g, " ").trim();
      const nameOrRoll = term ? `full_name.ilike.%${term}%,admission_number.ilike.%${term}%` : null;

      if (blockId !== "ALL") {
        let query = supabase
          .from("students")
          .select(
            "id, full_name, admission_number, course_name, phone, status, allocations!inner(status, deleted_at, block_id, rooms(room_number), beds(code), blocks(name))",
            { count: "exact" },
          )
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .in("allocations.status", LIVE_STAY)
          .is("allocations.deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to);
        query =
          blockId === "none"
            ? query.is("allocations.block_id", null)
            : query.eq("allocations.block_id", blockId);
        if (status !== "ALL") query = query.eq("status", status);
        if (nameOrRoll) query = query.or(nameOrRoll);
        const { data, error, count } = await query;
        if (error) throw error;
        return { rows: (data ?? []).map(toRow), total: count ?? 0 };
      }

      let query = supabase
        .from("students")
        .select(
          "id, full_name, admission_number, course_name, phone, status, allocations(status, deleted_at, rooms(room_number), beds(code), blocks(name))",
          { count: "exact" },
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (status !== "ALL") query = query.eq("status", status);
      if (nameOrRoll) query = query.or(nameOrRoll);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []).map(toRow), total: count ?? 0 };
    },
  });

  const rows = studentsQ.data?.rows ?? [];
  const total = studentsQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = !!q || blockId !== "ALL" || status !== "ALL";

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Students
          <span className="text-primary tabular-nums">({total.toLocaleString("en-IN")})</span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 lg:w-60 lg:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or roll no…"
              aria-label="Search students by name or roll number"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          {blocks.length > 0 ? (
            <Select value={blockId} onValueChange={setBlockId}>
              <SelectTrigger
                className="h-9 w-[132px] rounded-xl text-sm"
                aria-label="Filter by block"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All blocks</SelectItem>
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              className="h-9 w-[140px] rounded-xl text-sm"
              aria-label="Filter by status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => (v === "grid" || v === "list") && setView(v)}
            className="rounded-xl border border-border p-0.5"
            aria-label="Layout"
          >
            <ToggleGroupItem value="grid" aria-label="Card view" className="h-8 w-8 rounded-lg p-0">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 rounded-lg p-0">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {studentsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : studentsQ.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load students right now. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => studentsQ.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {isFiltered ? "No students match these filters" : "No students yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFiltered
                ? "Try another name, block or status."
                : "Add a student or import a list from Quick actions."}
            </p>
          </div>
        ) : view === "list" ? (
          <div className={cn("overflow-x-auto", studentsQ.isFetching && "opacity-70")}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student name</TableHead>
                  <TableHead>Roll / ID</TableHead>
                  <TableHead>Room / Bed</TableHead>
                  {blocks.length > 0 ? <TableHead>Block</TableHead> : null}
                  <TableHead>Course</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {page * PAGE_SIZE + i + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: s.id }}
                        className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary"
                      >
                        <StudentAvatar name={s.full_name} />
                        <span className="max-w-[180px] truncate">{s.full_name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {s.admission_number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.stay ? (
                        `${s.stay.room} / ${s.stay.bed}`
                      ) : (
                        <span className="text-muted-foreground">Not allotted</span>
                      )}
                    </TableCell>
                    {blocks.length > 0 ? (
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {s.stay?.block ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="max-w-[140px] truncate text-muted-foreground">
                      {s.course_name || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.phone ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatPhone(s.phone)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StudentStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <RowActions student={s} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ul
            className={cn(
              "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3",
              studentsQ.isFetching && "opacity-70",
            )}
          >
            {rows.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-3.5"
              >
                <StudentAvatar name={s.full_name} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/admin/students/$id"
                    params={{ id: s.id }}
                    className="block truncate font-medium text-foreground hover:text-primary"
                  >
                    {s.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.admission_number}
                    {s.course_name ? ` · ${s.course_name}` : ""}
                  </p>
                  <p className="mt-1.5 text-xs text-foreground">
                    {s.stay
                      ? `${s.stay.block ? `${s.stay.block} · ` : ""}Room ${s.stay.room} / ${s.stay.bed}`
                      : "Not allotted"}
                  </p>
                  <StudentStatusBadge status={s.status} className="mt-2" />
                </div>
                <RowActions student={s} />
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of{" "}
              {total.toLocaleString("en-IN")}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
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
                aria-label="Next page"
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
