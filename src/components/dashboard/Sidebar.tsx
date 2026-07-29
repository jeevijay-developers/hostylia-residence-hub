import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";
import { signOut } from "@/lib/auth";
import { PropertySwitcher } from "./PropertySwitcher";
import logoAsset from "@/assets/hostylia-logo.png";

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
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoAsset} alt="Hostylia" className="h-7 w-auto shrink-0" />
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

        <button
          type="button"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Sign out</span>}
        </button>
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}
