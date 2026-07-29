import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, UserRoundPen } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EditProfileDialog, fetchOwnProfile } from "@/components/dashboard/EditProfileDialog";
import { useResolvedRole } from "@/lib/user-role";
import { SIDEBAR_NAV, BOTTOM_NAV } from "@/lib/dashboard-nav";

export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = pathname.split("/").filter(Boolean);
  const navigate = useNavigate();
  const { data: role } = useResolvedRole();
  const [searchOpen, setSearchOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const { data: ownProfile } = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
  });
  const displayName = ownProfile?.preferred_name || ownProfile?.full_name || "";
  const avatarInitial = displayName.trim()[0]?.toUpperCase() ?? "?";

  const navItems = useMemo(() => {
    const roleKey = role?.role;
    if (!roleKey) return [];
    return SIDEBAR_NAV[roleKey] ?? BOTTOM_NAV[roleKey] ?? [];
  }, [role?.role]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted md:flex md:w-72"
      >
        <Search className="h-4 w-4" />
        <span>Search…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline-block">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setSearchOpen(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <ThemeToggle />
      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {avatarInitial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditProfileOpen(true)}>
            <UserRoundPen className="mr-2 h-4 w-4" />
            Edit profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />
    </header>
  );
}
