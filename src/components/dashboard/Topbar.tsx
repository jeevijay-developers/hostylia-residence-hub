import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, Search, User, UserRoundPen } from "lucide-react";

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
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EditProfileDialog, fetchOwnProfile } from "@/components/dashboard/EditProfileDialog";
import { ChangePasswordDialog } from "@/components/dashboard/ChangePasswordDialog";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { useResolvedRole } from "@/lib/user-role";
import type { NavItem } from "@/lib/dashboard-nav";

interface TopbarProps {
  navItems?: NavItem[];
}

export function Topbar({ navItems = [] }: TopbarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = pathname.split("/").filter(Boolean);
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const { data: ownProfile } = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
  });
  const displayName = ownProfile?.full_name || ownProfile?.preferred_name || "";
  const avatarInitial = displayName.trim()[0]?.toUpperCase() ?? "?";
  const { data: resolved } = useResolvedRole();
  const isAccountant = resolved?.role === "ACCOUNTANT";
  const isAdmin = resolved?.role === "HOSTEL_ADMIN";

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
        className="hidden items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground md:flex md:w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setSearchOpen(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
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
          {isAccountant ? (
            <>
              <DropdownMenuItem asChild>
                <Link to="/accountant/profile">
                  <User className="mr-2 h-4 w-4" />
                  My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/accountant/profile/edit">
                  <UserRoundPen className="mr-2 h-4 w-4" />
                  Edit Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/accountant/profile/change-password">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : isAdmin ? (
            <>
              <DropdownMenuItem onSelect={() => setEditProfileOpen(true)}>
                <UserRoundPen className="mr-2 h-4 w-4" />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setEditProfileOpen(true)}>
              <UserRoundPen className="mr-2 h-4 w-4" />
              Edit profile
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSignOutOpen(true);
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isAccountant && (
        <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />
      )}
      {isAdmin && (
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      )}
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </header>
  );
}
