import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";

interface BottomNavProps {
  items: NavItem[];
}

export function BottomNav({ items }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-30 border-t border-border bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 max-w-md auto-cols-fr grid-flow-col">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <li key={item.to} className="flex">
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
