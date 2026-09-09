import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, LogOut, User } from "lucide-react";

import { ProfileAvatarMenu } from "@/components/dashboard/ProfileAvatarMenu";
import { MessagesPanel } from "@/components/warden/MessagesPanel";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EditProfileDialog, fetchOwnProfile } from "@/components/dashboard/EditProfileDialog";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { useResolvedRole } from "@/lib/user-role";
import { BrandLockup } from "@/components/BrandLockup";
import { PropertySwitcher } from "@/components/dashboard/PropertySwitcher";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";

interface TopbarProps {
  navItems?: NavItem[];
  showPropertySwitcher?: boolean;
  tenantId?: string | null;
  /** Hides the mobile hamburger/Sheet nav trigger — used when a role-specific mobile bottom nav replaces it. */
  hideMobileNavTrigger?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Topbar({
  navItems = [],
  showPropertySwitcher,
  tenantId,
  hideMobileNavTrigger,
}: TopbarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = pathname.split("/").filter(Boolean);
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const { data: ownProfile } = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
  });
  const displayName = ownProfile?.full_name || ownProfile?.preferred_name || "";
  const avatarInitial = displayName.trim()[0]?.toUpperCase() ?? "?";
  const avatarUrl = ownProfile?.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(ownProfile.avatar_path).data.publicUrl
    : undefined;
  const { data: resolved } = useResolvedRole();
  const isAccountant = resolved?.role === "ACCOUNTANT";
  const isAdmin = resolved?.role === "HOSTEL_ADMIN";

  const isWarden = resolved?.role === "WARDEN";
  const isStudent = resolved?.role === "STUDENT";
  const isParent = resolved?.role === "PARENT";
  const isSuperAdmin = resolved?.role === "SUPER_ADMIN";

  let profileHref: string | undefined = undefined;
  if (isAdmin) profileHref = "/admin/profile";
  else if (isAccountant) profileHref = "/accountant/profile";
  else if (isWarden) profileHref = "/warden/profile";
  else if (isStudent) profileHref = "/student/profile";
  else if (isParent) profileHref = "/parent/profile";

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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/80 bg-background/90 px-4 backdrop-blur-md sm:px-6">
      {navItems.length > 0 && !hideMobileNavTrigger && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open navigation menu"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetHeader className="border-b border-border p-4 text-left">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <BrandLockup variant="lockup" className="h-8" />
            </SheetHeader>
            {showPropertySwitcher ? (
              <div className="border-b border-border p-3">
                <PropertySwitcher tenantId={tenantId ?? null} />
              </div>
            ) : null}
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navItems.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
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
      )}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => {
            if (i === 0 && crumbs.length > 1) return null;

            const path = "/" + crumbs.slice(0, i + 1).join("/");
            const isLast = i === crumbs.length - 1;
            const isId = UUID_RE.test(c) || /^\d+$/.test(c);
            const label = isId ? c : c.replace(/-/g, " ");
            const isFirstVisible = i === 1 || crumbs.length === 1;
            const crumbClasses = cn(
              "min-w-0 truncate",
              isId
                ? "max-w-[64px] sm:max-w-[110px]"
                : "max-w-[140px] shrink sm:max-w-none sm:shrink-0",
              isId ? "" : "capitalize",
            );
            return (
              <li
                key={path}
                className={cn("flex min-w-0 items-center gap-1.5", !isLast && "hidden sm:flex")}
              >
                {!isFirstVisible && (
                  <span className="hidden shrink-0 text-muted-foreground/50 sm:inline">/</span>
                )}
                {isLast ? (
                  <span className={cn(crumbClasses, "font-semibold text-foreground")} title={label}>
                    {label}
                  </span>
                ) : (
                  <Link
                    to={path}
                    className={cn(crumbClasses, "hover:text-foreground")}
                    title={label}
                  >
                    {label}
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
        className="hidden items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-muted/70 hover:text-foreground md:flex md:w-72"
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
      {isWarden && <MessagesPanel />}

      <div className="flex items-center gap-2">
        {isSuperAdmin && (
          <button
            type="button"
            aria-label="Log out"
            onClick={() => setSignOutOpen(true)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        {isAdmin || isWarden || isStudent || isAccountant ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary shadow-tone-glow ring-2 ring-primary/40 outline-none transition hover:ring-primary/60"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  avatarInitial
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[190px] p-2">
              <DropdownMenuItem asChild className="gap-3 rounded-lg px-2 py-2">
                <Link
                  to={
                    isAdmin
                      ? "/admin/profile"
                      : isWarden
                        ? "/warden/profile"
                        : isAccountant
                          ? "/accountant/profile"
                          : "/student/profile"
                  }
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground">Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setSignOutOpen(true)}
                className="gap-3 rounded-lg px-2 py-2"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground">
                  <LogOut className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-destructive">Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <ProfileAvatarMenu
            avatarUrl={avatarUrl}
            avatarInitial={avatarInitial}
            profileHref={profileHref}
            onProfileSelect={isSuperAdmin ? () => setEditProfileOpen(true) : undefined}
          />
        )}
      </div>

      {isSuperAdmin && (
        <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />
      )}
      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title={isAdmin || isWarden || isStudent || isAccountant ? "Sign out?" : undefined}
        confirmLabel={isAdmin || isWarden || isStudent || isAccountant ? "Sign out" : undefined}
      />
    </header>
  );
}
