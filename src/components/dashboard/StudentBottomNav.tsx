import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/dashboard-nav";

interface StudentBottomNavProps {
  /**
   * Left-of-center primary routes (Home, Fees, Gate Pass) — already
   * module-filtered. The component renders them split around the center slot:
   * the first ⌊n/2⌋ go left, the rest go right.
   */
  items: NavItem[];
  /**
   * The single center-action route (Attendance). When undefined the center
   * slot is hidden and items fill the bar normally.
   */
  centerItem?: NavItem;
  /**
   * Extra routes that don't fit the 5-slot bar — surfaced behind a trailing
   * "More" tab that opens a sheet listing them. Omitted/empty hides the tab
   * entirely (e.g. Warden, which fits everything in the 5 direct slots).
   */
  moreItems?: NavItem[];
}

/**
 * Student-only mobile bottom navigation.
 *
 * Layout (5 slots):
 *   [left items…] · [▲ Attendance] · [right items…]
 *
 * The center Attendance button is a circular primary-colored disc raised
 * above the bar with a shadow, matching the "FAB-in-nav" pattern common in
 * native mobile apps. Every other design token (colors, radii, shadows,
 * fonts) is inherited from the existing Hostylia theme — no new values added.
 *
 * Hidden at `lg` and above — desktop keeps the sidebar untouched.
 */
export function StudentBottomNav({ items, centerItem, moreItems = [] }: StudentBottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  // Split primary items around the center slot
  const half = Math.ceil(items.length / 2);
  const leftItems = items.slice(0, half);
  const rightItems = items.slice(half);

  const isCenterActive =
    !!centerItem &&
    (pathname === centerItem.to || pathname.startsWith(`${centerItem.to}/`));

  const isMoreActive = moreItems.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  return (
    <>
      {/* ── Bottom bar ── */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-3 bottom-3 z-30 rounded-[32px] border border-border/80 bg-card/95 shadow-card-ambient backdrop-blur-md lg:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {/* overflow-visible so the raised center button can escape upward */}
        <ul
          className="relative mx-auto flex h-16 max-w-md items-stretch"
          style={{ overflow: "visible", overflowX: "clip" }}
        >
          {/* ── Left items ── */}
          {leftItems.map((item) => (
            <NavTab key={item.to} item={item} pathname={pathname} />
          ))}

          {/* ── Center slot ── */}
          {centerItem ? (
            <li className="relative flex flex-1 items-end justify-center pb-2">
              {/* The raised disc sits above the bar via negative translateY */}
              <Link
                to={centerItem.to}
                aria-label={centerItem.label}
                aria-current={isCenterActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center",
                  "h-14 w-14 rounded-full",
                  // Raised above bar
                  "-translate-y-4",
                  // Primary fill
                  "bg-primary text-primary-foreground",
                  // Elevation shadow
                  "shadow-[0_4px_16px_-2px_rgba(0,0,0,0.35),0_1px_4px_rgba(0,0,0,0.2)]",
                  // Clean separation ring
                  "ring-2 ring-card",
                  // Micro-interaction
                  "transition-transform active:scale-95",
                  // Active glow
                  isCenterActive &&
                    "shadow-[0_4px_20px_-2px_color-mix(in_oklab,var(--primary)_45%,transparent),0_1px_4px_rgba(0,0,0,0.2)]",
                )}
              >
                {(() => {
                  const CenterIcon = centerItem.icon;
                  return <CenterIcon className="h-6 w-6 shrink-0" />;
                })()}
              </Link>
              {/* Label rendered inside the bar, below the disc */}
              <span
                className={cn(
                  "absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-semibold leading-none",
                  isCenterActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {centerItem.label}
              </span>
            </li>
          ) : null}

          {/* ── Right items ── */}
          {rightItems.map((item) => (
            <NavTab key={item.to} item={item} pathname={pathname} />
          ))}

          {/* ── More slot ── */}
          {moreItems.length > 0 && (
            <li className="flex flex-1 min-w-0">
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label="More"
                    className={cn(
                      "flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 px-1",
                      "text-sm font-semibold transition-colors",
                      isMoreActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="relative">
                      <MoreHorizontal className="h-5 w-5 shrink-0" />
                      {isMoreActive && (
                        <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary shadow-tone-glow" />
                      )}
                    </span>
                    <span className="w-full truncate text-center">More</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-3xl p-0">
                  <SheetHeader className="border-b border-border p-4 text-left">
                    <SheetTitle>More</SheetTitle>
                  </SheetHeader>
                  <nav className="space-y-1 p-3">
                    {moreItems.map((item) => {
                      const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                            active
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}

/* ── Reusable plain nav tab ─────────────────────────────────────────────── */

function NavTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  return (
    <li className="flex flex-1 min-w-0">
      <Link
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 px-1",
          "text-sm font-semibold transition-colors",
          active
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="relative">
          <Icon className="h-5 w-5 shrink-0" />
          {active && (
            <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary shadow-tone-glow" />
          )}
        </span>
        <span className="w-full truncate text-center">{item.label}</span>
      </Link>
    </li>
  );
}

