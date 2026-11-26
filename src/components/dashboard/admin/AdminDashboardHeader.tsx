import { useEffect, useState } from "react";
import { CalendarDays, Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getGreeting } from "@/lib/greeting";

interface AdminDashboardHeaderProps {
  propertyName?: string | null;
  propertyLocation?: string | null;
  /** IANA zone of the active property; the clock and greeting follow it. */
  timeZone?: string | null;
  isLoading?: boolean;
}

const GREETING_ICON: Record<string, LucideIcon> = {
  "Good Morning": Sunrise,
  "Good Afternoon": Sun,
  "Good Evening": Sunset,
  "Good Night": Moon,
};

function safeZone(zone: string | null | undefined) {
  const z = zone || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: z });
    return z;
  } catch {
    return "Asia/Kolkata";
  }
}

/** Ticks every 30s so the minute-resolution clock and the greeting never lag by more than that. */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatHeaderDate(now: Date, zone: string) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(now)) {
    parts[p.type] = p.value;
  }
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.timeZoneName ?? ""}`.trim();
}

function hourIn(now: Date, zone: string) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number.parseInt(h, 10);
}

/** Dashboard greeting: time-of-day salutation, active property, and the property-local clock. */
export function AdminDashboardHeader({
  propertyName,
  propertyLocation,
  timeZone,
  isLoading,
}: AdminDashboardHeaderProps) {
  const now = useMinuteClock();
  const zone = safeZone(timeZone);
  const greeting = getGreeting(hourIn(now, zone));
  const Icon = GREETING_ICON[greeting] ?? Sun;

  return (
    <header className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {greeting}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-1.5 h-4 w-48" />
          ) : propertyName ? (
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="truncate font-medium text-foreground/80">{propertyName}</span>
              {propertyLocation ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-1 w-1 rounded-full bg-muted-foreground/50"
                  />
                  <span className="truncate">{propertyLocation}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <p className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        <time dateTime={now.toISOString()}>{formatHeaderDate(now, zone)}</time>
      </p>
    </header>
  );
}
