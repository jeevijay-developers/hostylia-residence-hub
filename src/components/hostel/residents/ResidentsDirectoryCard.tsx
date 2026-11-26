import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  DoorOpen,
  Phone,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  DIRECTORY_PAGE,
  RESIDENT_FILTERS,
  useResidentsDirectory,
  type DuesState,
  type ResidentCounts,
  type ResidentFilter,
} from "@/lib/property-residents";
import { cn } from "@/lib/utils";

const RESIDENT_STATUS: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ACTIVE: { label: "Active", icon: CircleCheck, className: "bg-success/10 text-success" },
  APPLICANT: { label: "Applicant", icon: Clock, className: "bg-info/10 text-info" },
  VERIFIED: { label: "Verified", icon: ShieldCheck, className: "bg-info/10 text-info" },
  NOTICE_GIVEN: { label: "Notice given", icon: Bell, className: "bg-warning/10 text-warning" },
  MOVED_OUT: { label: "Moved out", icon: DoorOpen, className: "bg-muted text-muted-foreground" },
  REJECTED: { label: "Rejected", icon: CircleX, className: "bg-destructive/10 text-destructive" },
};

export function ResidentStatusPill({ status }: { status: string }) {
  const s = RESIDENT_STATUS[status] ?? {
    label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "),
    icon: Clock,
    className: "bg-muted text-muted-foreground",
  };
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

const FILTER_META: Record<
  ResidentFilter,
  { label: string; dot?: string; count: (c: ResidentCounts) => number }
> = {
  ALL: { label: "All", count: (c) => c.total },
  ACTIVE: { label: "Active", dot: "bg-success", count: (c) => c.active },
  APPLICANT: { label: "Applicant", dot: "bg-info", count: (c) => c.applicants },
  NOTICE_GIVEN: { label: "Notice given", dot: "bg-warning", count: (c) => c.noticeGiven },
  MOVED_OUT: { label: "Moved out", dot: "bg-muted-foreground/60", count: (c) => c.movedOut },
};

const AVATAR_TONES = [
  "bg-chart-cat-1/15 text-chart-cat-1",
  "bg-chart-cat-2/15 text-chart-cat-2",
  "bg-chart-cat-3/15 text-chart-cat-3",
  "bg-primary/10 text-primary",
];

function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** "+91 98290 11234" for Indian mobile numbers; anything else as stored. */
function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : phone;
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function DuesCell({ dues }: { dues: DuesState }) {
  if (dues.kind === "DUE") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-destructive">
        <CircleAlert className="h-4 w-4" aria-hidden="true" /> Due {rupees(dues.paise)}
      </span>
    );
  }
  if (dues.kind === "PAID") {
    return (
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> Paid
      </span>
    );
  }
  if (dues.kind === "SETTLED") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CircleCheck className="h-4 w-4" aria-hidden="true" /> Settled
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground"
      title="No invoice issued yet"
    >
      <Clock className="h-4 w-4" aria-hidden="true" /> Not billed
    </span>
  );
}

function AttendancePill({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    pct >= 75
      ? "bg-success/10 text-success"
      : pct >= 50
        ? "bg-warning/10 text-warning"
        : "bg-destructive/10 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone,
      )}
      title="Attendance over the last 30 days"
    >
      {pct}%
    </span>
  );
}

/**
 * The property's residents: search (name, admission ID, phone), status chips
 * with counts, 8 rows per page from the database, and each row's room/bed,
 * outstanding dues and 30-day attendance.
 */
export function ResidentsDirectoryCard({
  propertyId,
  counts,
  onAddResident,
}: {
  propertyId: string;
  counts?: ResidentCounts;
  onAddResident?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResidentFilter>("ALL");
  const q = useDebouncedValue(search.trim(), 300);
  const pageKey = `${q}|${filter}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });

  const dirQ = useResidentsDirectory(propertyId, { q, filter, page });
  const rows = dirQ.data?.rows ?? [];
  const total = dirQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE));

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Residents directory
        </CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative w-44 shrink-0 sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search residents (name, ID, phone)…"
              aria-label="Search residents by name, admission ID or phone"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          <div
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]"
            role="radiogroup"
            aria-label="Filter residents by status"
          >
            {RESIDENT_FILTERS.map((f) => {
              const meta = FILTER_META[f];
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
                  {meta.dot ? (
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden="true" />
                  ) : null}
                  {meta.label}
                  {counts ? ` (${meta.count(counts).toLocaleString("en-IN")})` : ""}
                </button>
              );
            })}
          </div>
          {onAddResident ? (
            <Button size="sm" className="h-9 shrink-0 rounded-xl" onClick={onAddResident}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add resident</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {dirQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : dirQ.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load residents right now. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => dirQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {q || filter !== "ALL" ? "No residents match" : "No residents yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || filter !== "ALL"
                ? "Try another name, ID, phone or status."
                : "Add a resident to get started."}
            </p>
          </div>
        ) : (
          <div className={cn("overflow-x-auto", dirQ.isFetching && "opacity-70")}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Resident</TableHead>
                  <TableHead>Admission ID</TableHead>
                  <TableHead>Room / Bed</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dues / Payment</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
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
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {r.admission_number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.stay ? (
                        `${r.stay.room} / ${r.stay.bed}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          {formatPhone(r.phone)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ResidentStatusPill status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DuesCell dues={r.dues} />
                    </TableCell>
                    <TableCell>
                      <AttendancePill pct={r.attendancePct} />
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

        {total > DIRECTORY_PAGE ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {page * DIRECTORY_PAGE + 1}–{Math.min(total, (page + 1) * DIRECTORY_PAGE)} of{" "}
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
