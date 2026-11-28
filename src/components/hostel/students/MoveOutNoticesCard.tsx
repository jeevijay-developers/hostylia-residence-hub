import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, ChevronRight, CircleAlert, DoorOpen } from "lucide-react";

import { CardPager } from "@/components/hostel/students/KycApprovalsCard";
import { StudentAvatar } from "@/components/hostel/students/StudentStatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MOVE_OUT_PAGE_SIZE,
  usePropertyMoveOutNotices,
  type MoveOutNoticeRow,
} from "@/lib/property-students";
import { cn } from "@/lib/utils";

/** A calendar date ("2026-12-05") as "05 Dec 2026", without a timezone shift. */
const fmtDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Today's date in IST as YYYY-MM-DD (en-CA formats ISO-style). */
const todayIst = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function NoticeRow({ n, today }: { n: MoveOutNoticeRow; today: string }) {
  const isOverdue = !!n.requestedDate && n.requestedDate.slice(0, 10) < today;
  const place = n.room ? `${n.room}${n.bed ? ` / ${n.bed}` : ""}` : "No bed";
  return (
    <li>
      <Link
        to="/admin/students/$id/move-out"
        params={{ id: n.studentId }}
        className="group flex items-center gap-3 rounded-lg py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StudentAvatar id={n.studentId} name={n.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground group-hover:text-primary">
            {n.name}{" "}
            <span className="font-normal text-muted-foreground">({n.admission_number})</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {place}
            {n.status === "MOVE_OUT_INSPECTION" ? " · Inspection" : ""}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs",
            isOverdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {isOverdue ? (
            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {n.requestedDate ? fmtDate(n.requestedDate) : "Date not set"}
          {isOverdue ? <span className="sr-only">(overdue)</span> : null}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/** Students on notice or under move-out inspection, soonest move-out first. */
export function MoveOutNoticesCard({
  tenantId,
  propertyId,
}: {
  tenantId: string;
  propertyId: string;
}) {
  const [page, setPage] = useState(0);
  const noticesQ = usePropertyMoveOutNotices(tenantId, propertyId, page);
  const rows = noticesQ.data?.rows ?? [];
  const total = noticesQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / MOVE_OUT_PAGE_SIZE));
  const today = todayIst();

  // A completed move-out can empty the last page: step back.
  const isStale = !noticesQ.data || noticesQ.isPlaceholderData;
  useEffect(() => {
    if (!isStale && page > 0 && page >= pages) setPage(pages - 1);
  }, [isStale, page, pages]);

  return (
    <Card className="flex flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <DoorOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          Move-out notices
        </CardTitle>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {total.toLocaleString("en-IN")} upcoming
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {noticesQ.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading move-out notices">
            {Array.from({ length: MOVE_OUT_PAGE_SIZE }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : noticesQ.isError ? (
          <div className="py-6 text-center" role="alert">
            <p className="text-sm text-muted-foreground">Couldn’t load move-out notices.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => noticesQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <DoorOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm text-muted-foreground">No one has given notice</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border/60" aria-busy={noticesQ.isFetching}>
              {rows.map((n) => (
                <NoticeRow key={n.allocationId} n={n} today={today} />
              ))}
            </ul>
            <CardPager page={page} pages={pages} onPageChange={setPage} label="move-out notices" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
