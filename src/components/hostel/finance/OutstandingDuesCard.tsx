import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr } from "@/lib/finance";
import {
  DUES_PAGE,
  avatarTone,
  daysFromToday,
  fullDate,
  initials,
  usePropertyDuesList,
} from "@/lib/property-finance";
import { cn } from "@/lib/utils";

function DueWhen({ dueDate }: { dueDate: string }) {
  const days = daysFromToday(dueDate);
  if (days < 0) {
    const late = -days;
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {late} day{late === 1 ? "" : "s"} late
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
      <Clock className="h-3 w-3" aria-hidden="true" />
      {days === 0 ? "Due today" : `In ${days} day${days === 1 ? "" : "s"}`}
    </span>
  );
}

/**
 * Open invoices with a balance, oldest due date first, paged in the database.
 * Each row opens the resident, whose page shows their invoices and payments.
 */
export function OutstandingDuesCard({ propertyId }: { propertyId: string }) {
  const [page, setPage] = useState(0);
  const q = usePropertyDuesList(propertyId, page);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DUES_PAGE));
  // A payment elsewhere can shrink the list under the current page.
  const safePage = Math.min(page, pages - 1);
  useEffect(() => {
    if (safePage !== page && !q.isFetching) setPage(safePage);
  }, [safePage, page, q.isFetching]);

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <TriangleAlert className="h-5 w-5 text-primary" aria-hidden="true" />
          Outstanding dues
        </CardTitle>
        <Link
          to="/admin/reports"
          title="DSO & aging report: every unpaid invoice of this property, most overdue first"
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Aging report <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {q.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn’t load outstanding dues. Please try again.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => q.refetch()}>
              Try again
            </Button>
          </div>
        ) : q.isLoading || (rows.length === 0 && total > 0) ? (
          // An empty page while dues remain means the list shrank under the
          // current page: keep the skeleton until the pager clamps back.
          <div className="space-y-2">
            {Array.from({ length: DUES_PAGE }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-success/10 text-success">
              <CircleCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">No outstanding dues</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every issued invoice for this property is paid up.
            </p>
          </div>
        ) : (
          <ul className={cn("divide-y divide-border/60", q.isFetching && "opacity-70")}>
            {rows.map((r) => (
              <li key={r.invoiceId}>
                <Link
                  to="/admin/students/$id"
                  params={{ id: r.studentId }}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 text-sm transition-colors hover:text-primary sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                  title={`Invoice ${r.invoiceNumber}`}
                >
                  <span
                    className={cn(
                      "row-span-2 grid h-9 w-9 place-items-center rounded-full text-xs font-semibold sm:row-span-1",
                      avatarTone(r.studentId),
                    )}
                    aria-hidden="true"
                  >
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r.name}
                      {r.room ? (
                        <span className="font-normal text-muted-foreground"> ({r.room})</span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.invoiceNumber}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right font-semibold text-destructive tabular-nums">
                    Due {formatInr(r.balancePaise)}
                  </span>
                  <span className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground sm:col-start-auto sm:justify-end">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      {fullDate(r.dueDate)}
                    </span>
                    <DueWhen dueDate={r.dueDate} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {total > DUES_PAGE ? (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {safePage * DUES_PAGE + 1}–{Math.min(total, (safePage + 1) * DUES_PAGE)} of{" "}
              {total.toLocaleString("en-IN")} invoices
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous dues"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-1 tabular-nums">
                {safePage + 1} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={safePage + 1 >= pages}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next dues"
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
