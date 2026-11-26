import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { useKycLockedToast } from "@/lib/kyc";
import { isNavItemActive, type NavBadgeKey, type NavItem } from "@/lib/dashboard-nav";
import { NAV_BADGE_DESCRIPTION, type NavBadgeCounts } from "@/lib/nav-badges";

interface NavListProps {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  badges?: NavBadgeCounts;
  /** Called after a link is followed (the mobile sheet closes itself with it). */
  onNavigate?: () => void;
  className?: string;
}

// Soft tints so counts inform without shouting.
const BADGE_TONE: Record<NavBadgeKey, string> = {
  complaints: "bg-destructive/12 text-destructive",
  finance: "bg-primary/12 text-primary",
  support: "bg-info/12 text-info",
};

const BADGE_DOT: Record<NavBadgeKey, string> = {
  complaints: "bg-destructive",
  finance: "bg-primary",
  support: "bg-info",
};

/**
 * Role navigation shared by the desktop Sidebar and the mobile nav sheet.
 * Items with a `section` are grouped under a small heading; items without one
 * render exactly as the old flat list did.
 */
export function NavList({
  items,
  pathname,
  collapsed,
  badges,
  onNavigate,
  className,
}: NavListProps) {
  const showLockedToast = useKycLockedToast();

  return (
    <nav className={cn("space-y-0.5", className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const active = isNavItemActive(pathname, item.to);
        const startsSection = !!item.section && item.section !== items[index - 1]?.section;
        const count = item.badge ? badges?.[item.badge] : undefined;
        const showCount = item.badge && count != null && count > 0;
        const countLabel = count != null && count > 99 ? "99+" : String(count ?? "");

        const heading = startsSection ? (
          collapsed ? (
            index > 0 ? (
              <div aria-hidden="true" className="mx-2 my-2 h-px bg-border/70" />
            ) : null
          ) : (
            <p
              className={cn(
                "px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80",
                index > 0 ? "pt-4" : "pt-1",
              )}
            >
              {item.section}
            </p>
          )
        ) : null;

        if (item.locked) {
          return (
            <Fragment key={item.to}>
              {heading}
              <button
                type="button"
                aria-disabled="true"
                onClick={showLockedToast}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/70 transition hover:bg-muted",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? `${item.label} (locked)` : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && <Lock className="ml-auto h-3.5 w-3.5 shrink-0" />}
              </button>
            </Fragment>
          );
        }

        return (
          <Fragment key={item.to}>
            {heading}
            <Link
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary before:absolute before:-left-3 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-2 before:hidden",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
              {showCount && item.badge ? (
                collapsed ? (
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-card",
                      BADGE_DOT[item.badge],
                    )}
                    aria-label={`${count} ${NAV_BADGE_DESCRIPTION[item.badge]}`}
                  />
                ) : (
                  <span
                    className={cn(
                      "ml-auto min-w-6 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-4 tabular-nums",
                      BADGE_TONE[item.badge],
                    )}
                    title={`${count} ${NAV_BADGE_DESCRIPTION[item.badge]}`}
                  >
                    {countLabel}
                    <span className="sr-only"> {NAV_BADGE_DESCRIPTION[item.badge]}</span>
                  </span>
                )
              ) : null}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
