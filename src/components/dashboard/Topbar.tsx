import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Search } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => {
            const path = "/" + crumbs.slice(0, i + 1).join("/");
            const last = i === crumbs.length - 1;
            return (
              <li key={path} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                {last ? (
                  <span className="truncate font-medium text-foreground capitalize">
                    {c.replace(/-/g, " ")}
                  </span>
                ) : (
                  <Link to={path} className="truncate capitalize hover:text-foreground">
                    {c.replace(/-/g, " ")}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="hidden items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground md:flex md:w-72">
        <Search className="h-4 w-4" />
        <span>Search…</span>
      </div>

      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          H
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              window.location.href = "/login";
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
