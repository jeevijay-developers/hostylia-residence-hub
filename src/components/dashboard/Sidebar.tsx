import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, ChevronsLeft, ChevronsRight, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";
import { useNavBadges } from "@/lib/nav-badges";
import { usePropertyStore } from "@/stores/property-store";
import { PropertySwitcher } from "./PropertySwitcher";
import { NavList } from "./NavList";
import { BrandLockup } from "@/components/BrandLockup";

interface SidebarProps {
  items: NavItem[];
  showPropertySwitcher?: boolean;
  tenantId?: string | null;
  /** Where "All properties" goes; shown under the switcher when set. */
  allPropertiesHref?: string;
}

export function Sidebar({
  items,
  showPropertySwitcher,
  tenantId,
  allPropertiesHref,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const badges = useNavBadges(
    items.some((i) => i.badge),
    tenantId ?? null,
    propertyId,
  );

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border/80 bg-card transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center",
          collapsed ? "flex-col justify-center gap-1 px-2" : "justify-between px-4",
        )}
      >
        <Link
          to="/"
          aria-label="Hostylia home"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <BrandLockup
            variant={collapsed ? "mark" : "lockup"}
            className={collapsed ? "h-7" : "h-8"}
          />
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-expanded={true}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-expanded={false}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="grid h-8 w-8 place-items-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {showPropertySwitcher ? (
        <div className={cn("space-y-2 px-3 pb-3", collapsed && "px-2")}>
          {!collapsed && <p className="px-1 text-xs font-medium text-muted-foreground">Property</p>}
          <PropertySwitcher tenantId={tenantId ?? null} collapsed={collapsed} />
          {allPropertiesHref ? (
            <Link
              to={allPropertiesHref}
              title={collapsed ? "All properties" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border/80 px-3 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed && "justify-center px-2",
              )}
            >
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
              {!collapsed && (
                <>
                  <span className="flex-1">All properties</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </>
              )}
            </Link>
          ) : null}
        </div>
      ) : null}

      <NavList
        items={items}
        pathname={pathname}
        collapsed={collapsed}
        badges={badges}
        className={cn("flex-1 overflow-y-auto border-t border-border/60 p-3", collapsed && "px-2")}
      />
    </aside>
  );
}
