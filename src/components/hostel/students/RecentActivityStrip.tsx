import {
  Activity,
  BedDouble,
  Bell,
  DoorOpen,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentActivity, type StudentEventKind } from "@/lib/property-students";
import { cn } from "@/lib/utils";

const STRIP_SIZE = 5;

const EVENT: Record<StudentEventKind, { icon: LucideIcon; label: string; tone: string }> = {
  ADDED: { icon: UserPlus, label: "Student added", tone: "bg-primary/10 text-primary" },
  ALLOTTED: { icon: BedDouble, label: "Bed allotted", tone: "bg-success/10 text-success" },
  KYC: { icon: ShieldCheck, label: "KYC approved", tone: "bg-info/10 text-info" },
  NOTICE: { icon: Bell, label: "Move-out notice", tone: "bg-warning/10 text-warning" },
  MOVED_OUT: { icon: DoorOpen, label: "Moved out", tone: "bg-muted text-muted-foreground" },
};

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * The five most recent student events at this property, as a horizontal
 * stepper on wide screens and a stacked timeline on small ones.
 */
export function RecentActivityStrip({ propertyId }: { propertyId: string }) {
  const activityQ = useStudentActivity(propertyId, STRIP_SIZE);
  const events = activityQ.data ?? [];

  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activityQ.isLoading ? (
          <div
            className="grid grid-cols-1 gap-3 lg:grid-cols-5"
            aria-busy="true"
            aria-label="Loading recent activity"
          >
            {Array.from({ length: STRIP_SIZE }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : activityQ.isError ? (
          <div className="py-4 text-center" role="alert">
            <p className="text-sm text-muted-foreground">Couldn’t load recent activity.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => activityQ.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : events.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No student activity yet.</p>
        ) : (
          <ol className="grid grid-cols-1 lg:grid-cols-5">
            {events.map((e, i) => {
              const meta = EVENT[e.kind];
              const Icon = meta.icon;
              const isLast = i === events.length - 1;
              return (
                <li
                  key={e.key}
                  className="relative flex gap-3 pb-4 last:pb-0 lg:flex-col lg:items-center lg:px-2 lg:pb-0 lg:text-center"
                >
                  {!isLast ? (
                    <>
                      {/* Connector to the next event: vertical when stacked, horizontal on lg+. */}
                      <span
                        className="absolute bottom-0 left-5 top-11 w-px bg-border lg:hidden"
                        aria-hidden="true"
                      />
                      <span
                        className="absolute left-[calc(50%+1.75rem)] right-[calc(-50%+1.75rem)] top-5 hidden h-px bg-border lg:block"
                        aria-hidden="true"
                      />
                    </>
                  ) : null}
                  <span
                    className={cn(
                      "relative grid h-10 w-10 shrink-0 place-items-center rounded-full",
                      meta.tone,
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 lg:w-full">
                    <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.name}
                      {e.admission_number ? ` (${e.admission_number})` : ""}
                    </p>
                    {e.detail ? (
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                    ) : null}
                    <time dateTime={e.at} className="mt-0.5 block text-xs text-muted-foreground">
                      {fmtWhen(e.at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
