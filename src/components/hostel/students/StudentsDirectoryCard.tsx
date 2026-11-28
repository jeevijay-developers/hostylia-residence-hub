import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Phone,
  Search,
  Users,
} from "lucide-react";

import {
  StudentAvatar,
  StudentStatusDot,
  StudentStatusPill,
} from "@/components/hostel/students/StudentStatusPill";
import { StudentRowActions } from "@/components/hostel/students/StudentRowActions";
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
  DIRECTORY_PAGE_SIZE,
  STUDENT_FILTERS,
  useStudentsDirectory,
  type DuesState,
  type StudentCounts,
  type StudentFilter,
} from "@/lib/property-students";
import { formatRupees } from "@/lib/student-placement";
import { cn } from "@/lib/utils";

const FILTER_META: Record<StudentFilter, { label: string; count: (c: StudentCounts) => number }> = {
  ALL: { label: "All", count: (c) => c.total },
  APPLICANT: { label: "Applicant", count: (c) => c.applicant },
  VERIFIED: { label: "Verified", count: (c) => c.verified },
  ACTIVE: { label: "Active", count: (c) => c.active },
  NOTICE_GIVEN: { label: "Notice given", count: (c) => c.noticeGiven },
  MOVED_OUT: { label: "Moved out", count: (c) => c.movedOut },
  REJECTED: { label: "Rejected", count: (c) => c.rejected },
  ARCHIVED: { label: "Archived", count: (c) => c.archived },
};

/** Allocation states that hold a bed before the stay is live. */
const PENDING_STAY: Record<string, string> = {
  PENDING_AGREEMENT: "Agreement pending",
  PENDING_PAYMENT: "First payment pending",
};

/** "+91 98290 11234" for Indian mobile numbers; anything else as stored. */
function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return local.length === 10 ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : phone;
}

/** Up to five page numbers centred on the current page. */
function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages);
  const start = Math.max(0, Math.min(page - 2, pages - size));
  return Array.from({ length: size }, (_, i) => start + i);
}

function DuesCell({ dues }: { dues: DuesState }) {
  if (dues.kind === "DUE") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-destructive">
        <CircleAlert className="h-4 w-4" aria-hidden="true" /> Due {formatRupees(dues.paise)}
      </span>
    );
  }
  if (dues.kind === "PAID") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground">
        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> {formatRupees(0)}
        <span className="sr-only">due — all invoices paid</span>
      </span>
    );
  }
  if (dues.kind === "SETTLED") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
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

const Dash = () => <span className="text-muted-foreground">—</span>;

/**
 * The property's students: search (name, admission ID, email, phone), status
 * chips with counts, 8 rows per page from the database, and each row's
 * guardian, room/bed, dues and lifecycle actions.
 */
export function StudentsDirectoryCard({
  tenantId,
  propertyId,
  counts,
}: {
  tenantId: string;
  propertyId: string;
  counts?: StudentCounts;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("ALL");
  const q = useDebouncedValue(search.trim(), 300);
  // A new search or filter starts again from page 1.
  const pageKey = `${q}|${filter}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (n: number) => setPaging({ key: pageKey, page: n });

  const dirQ = useStudentsDirectory(propertyId, { q, filter, page });
  const rows = dirQ.data?.rows ?? [];
  const total = dirQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));

  // Archiving or moving the last student on a page leaves it empty: step back.
  const isStale = !dirQ.data || dirQ.isPlaceholderData;
  useEffect(() => {
    if (!isStale && page > 0 && page >= pages) {
      setPaging({ key: pageKey, page: pages - 1 });
    }
  }, [isStale, page, pages, pageKey]);

  const isFiltered = q !== "" || filter !== "ALL";

  return (
    <Card className="flex h-full min-w-0 flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            Students directory
          </CardTitle>
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email or phone…"
              aria-label="Search students by name, admission ID, email or phone"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
        </div>
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]"
          role="radiogroup"
          aria-label="Filter students by status"
        >
          {STUDENT_FILTERS.map((f) => {
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
                {f !== "ALL" ? <StudentStatusDot status={f} /> : null}
                {meta.label}
                {counts ? (
                  <span className="tabular-nums">
                    ({meta.count(counts).toLocaleString("en-IN")})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {dirQ.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading students">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : dirQ.isError ? (
          <div className="py-10 text-center" role="alert">
            <p className="text-sm text-muted-foreground">
              Couldn’t load students right now. Please try again.
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
              {isFiltered ? "No students match" : "No students yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFiltered
                ? "Try another name, ID, phone or status."
                : "Add a student or share the public admission form to get started."}
            </p>
          </div>
        ) : (
          <div
            className={cn("transition-opacity", dirQ.isFetching && "opacity-70")}
            aria-busy={dirQ.isFetching}
          >
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Admission ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Room / Bed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dues</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {page * DIRECTORY_PAGE_SIZE + i + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/students/$id"
                        params={{ id: r.id }}
                        className="group flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <StudentAvatar id={r.id} name={r.full_name} />
                        <span className="min-w-0">
                          <span className="block max-w-[200px] truncate font-medium text-foreground group-hover:text-primary">
                            {r.full_name}
                          </span>
                          <span className="block max-w-[200px] truncate text-xs text-muted-foreground">
                            {r.email ?? "No email"}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {r.admission_number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          {formatPhone(r.phone)}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.guardian ? (
                        <span className="block max-w-[170px]">
                          <span className="block truncate text-foreground">{r.guardian.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.guardian.relationship ?? "Guardian"}
                          </span>
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.stay ? (
                        <>
                          <span className="block text-foreground">
                            {r.stay.room} / {r.stay.bed}
                          </span>
                          {PENDING_STAY[r.stay.allocationStatus] ? (
                            <span className="block text-xs text-muted-foreground">
                              {PENDING_STAY[r.stay.allocationStatus]}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell>
                      <StudentStatusPill status={r.archivedAt ? "ARCHIVED" : r.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DuesCell dues={r.dues} />
                    </TableCell>
                    <TableCell className="text-right">
                      <StudentRowActions row={r} tenantId={tenantId} propertyId={propertyId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && !dirQ.isError ? (
          <nav
            aria-label="Students pages"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground"
          >
            <span className="tabular-nums">
              {(page * DIRECTORY_PAGE_SIZE + 1).toLocaleString("en-IN")}–
              {Math.min(total, (page + 1) * DIRECTORY_PAGE_SIZE).toLocaleString("en-IN")} of{" "}
              {total.toLocaleString("en-IN")} {total === 1 ? "student" : "students"}
            </span>
            {pages > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                {pageWindow(page, pages).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 rounded-lg tabular-nums"
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p + 1}`}
                    aria-current={p === page ? "page" : undefined}
                  >
                    {p + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}
