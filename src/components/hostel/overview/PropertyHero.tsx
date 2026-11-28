import { Link, useRouterState } from "@tanstack/react-router";
import {
  BedDouble,
  Bell,
  Building2,
  CalendarCheck,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  Pencil,
  TriangleAlert,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import propertyBanner from "@/assets/illustrations/property-banner.webp";
import { PropertyStatusBadge } from "@/components/hostel/PropertyCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cleanPlace } from "@/lib/admin-properties";
import { cn } from "@/lib/utils";

interface HeroProperty {
  id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
}

interface PropertyHeroProps {
  property: HeroProperty;
  blocks?: number;
  beds?: number;
  residents?: number;
  isLoadingCounts?: boolean;
}

const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

/** Property name, status, location and size, with the building artwork on the right. */
export function PropertyHero({
  property,
  blocks,
  beds,
  residents,
  isLoadingCounts,
}: PropertyHeroProps) {
  const status = property.status.toUpperCase();
  const place = [cleanPlace(property.city), cleanPlace(property.state)].filter(Boolean).join(", ");
  const facts: { icon: LucideIcon; text: string }[] = [
    { icon: Building2, text: plural(blocks ?? 0, "Block") },
    { icon: BedDouble, text: plural(beds ?? 0, "Bed") },
    { icon: Users, text: plural(residents ?? 0, "Student") },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card-ambient">
      <img
        src={propertyBanner}
        alt=""
        aria-hidden="true"
        width={877}
        height={320}
        // Fixed size per breakpoint and pinned to the bottom edge, so the building
        // sits on the card's floor and never shifts or rescales with the window
        // (the asset is trimmed to its visible pixels — no transparent margin).
        className="pointer-events-none absolute bottom-0 right-44 hidden h-[120px] w-auto max-w-none select-none [mask-image:linear-gradient(to_right,transparent,black_18%,black_88%,transparent)] xl:block 2xl:h-[150px]"
      />
      <div className="relative flex flex-col gap-4 p-5 sm:p-6 md:min-h-[148px] 2xl:min-h-[164px] md:flex-row md:items-start md:justify-between">
        {/* At xl+ the building art sits at a fixed spot on the right (its left edge is
            505px / 587px from the card's right edge), so the text column stops short of it. */}
        <div className="flex min-w-0 items-start gap-4 xl:max-w-[calc(100%-500px)] 2xl:max-w-[calc(100%-582px)]">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-16 sm:w-16">
            <Building2 className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="min-w-0 max-w-full truncate font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {property.name}
              </h1>
              <PropertyStatusBadge status={status} />
            </div>
            <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                {place || "Address not set"}
              </li>
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {isLoadingCounts ? <Skeleton className="h-4 w-14" /> : text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button asChild variant="outline" className="h-9 rounded-xl bg-card/90 backdrop-blur">
            <Link to="/admin/properties/$slug/edit" params={{ slug: property.slug }}>
              <Pencil className="h-4 w-4" /> Edit property
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

const tabClass =
  // flex-auto + shrink-0: tabs share the bar's full width evenly, and scroll on narrow screens.
  "flex flex-auto shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeTabClass = "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary";

/**
 * Property section tabs — every tab is one of this property's own pages
 * (Overview, Rooms & Beds, Students, Finance, Attendance, Complaints,
 * Notices, Staff). The pages make this property the active one when they open.
 */
export function PropertyTabs({ slug, className }: { slug: string; className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Setup (/structure) is part of Rooms & Beds, so the tab stays highlighted there.
  const inRooms = /\/(rooms|structure)\/?$/.test(pathname);
  return (
    <nav
      aria-label="Property sections"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-card p-1.5 shadow-card-ambient [scrollbar-width:none]",
        className,
      )}
    >
      <Link
        to="/admin/properties/$slug"
        params={{ slug }}
        activeOptions={{ exact: true }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Overview
      </Link>
      <Link
        to="/admin/properties/$slug/rooms"
        params={{ slug }}
        className={cn(tabClass, inRooms && activeTabClass)}
        aria-current={inRooms ? "page" : undefined}
      >
        <BedDouble className="h-4 w-4" aria-hidden="true" /> Rooms &amp; Beds
      </Link>
      <Link
        to="/admin/properties/$slug/students"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <Users className="h-4 w-4" aria-hidden="true" /> Students
      </Link>
      <Link
        to="/admin/properties/$slug/finance"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <IndianRupee className="h-4 w-4" aria-hidden="true" /> Finance
      </Link>
      <Link
        to="/admin/properties/$slug/attendance"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Attendance
      </Link>
      <Link
        to="/admin/properties/$slug/complaints"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Complaints
      </Link>
      <Link
        to="/admin/properties/$slug/notices"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <Bell className="h-4 w-4" aria-hidden="true" /> Notices
      </Link>
      <Link
        to="/admin/properties/$slug/staff"
        params={{ slug }}
        className={tabClass}
        activeProps={{ className: activeTabClass, "aria-current": "page" }}
      >
        <UserCog className="h-4 w-4" aria-hidden="true" /> Staff
      </Link>{" "}
    </nav>
  );
}
