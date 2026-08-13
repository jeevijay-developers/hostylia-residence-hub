import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";

interface BottomNavProps {
  items: NavItem[];
}

export function BottomNav({ items }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const centerIndex = items.length % 2 === 1 ? Math.floor(items.length / 2) : -1;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 overflow-visible border-t border-border bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="relative mx-auto grid h-16 max-w-md auto-cols-fr grid-flow-col overflow-visible">
        {items.map((item, i) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const isCenter = i === centerIndex;

          if (isCenter) {
            return (
              <li key={item.to} className="relative flex min-w-0 items-center justify-center">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "absolute -top-6 flex h-14 w-14 flex-col items-center justify-center rounded-full ring-[6px] ring-card transition",
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40"
                      : "bg-primary text-primary-foreground shadow-md shadow-primary/30 hover:bg-primary",
                  )}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                </Link>
                <span className="absolute bottom-1.5 w-full truncate text-center text-[10px] font-medium text-muted-foreground">
                  {item.label}
                </span>
              </li>
            );
          }

          return (
            <li key={item.to} className="flex min-w-0 overflow-hidden">
              <Link
                to={item.to}
                className={cn(
                  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
