import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";
import { PropertySwitcher } from "./PropertySwitcher";
import { BrandLockup } from "@/components/BrandLockup";

interface SidebarProps {
  items: NavItem[];
  showPropertySwitcher?: boolean;
  tenantId?: string | null;
}

export function Sidebar({ items, showPropertySwitcher, tenantId }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-card transition-all lg:flex",
        collapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-border py-4",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link
          to="/"
          aria-label="Hostylia home"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {/* The asset already carries the wordmark — never print it again alongside. */}
          <BrandLockup variant={collapsed ? "mark" : "lockup"} className="h-8" />
        </Link>
      </div>

      {showPropertySwitcher ? (
        <div className={cn("border-b border-border p-3", collapsed && "px-2")}>
          <PropertySwitcher tenantId={tenantId ?? null} collapsed={collapsed} />
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : undefined}
        className={cn(
          "flex items-center gap-2 border-t border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}
