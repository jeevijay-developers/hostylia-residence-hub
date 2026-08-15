import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BrandLockup } from "@/components/BrandLockup";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { MessagesPanel } from "@/components/warden/MessagesPanel";
import { useResolvedRole } from "@/lib/user-role";

export function MobileHeader() {
  const { data: resolved } = useResolvedRole();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const isWarden = resolved?.role === "WARDEN";
  const isParent = resolved?.role === "PARENT";
  const isStudent = resolved?.role === "STUDENT";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <BrandLockup variant="lockup" className="h-7" />
      </Link>
      <div className="flex items-center gap-1">
        {isWarden && <MessagesPanel />}
        <NotificationBell />
        {!isStudent && <LanguageSwitcher />}
        {isWarden ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-10">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/warden/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : isParent ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-10">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/parent/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            onClick={() => setSignOutOpen(true)}
          >
            Logout
          </Button>
        )}
      </div>
      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title={isParent || isStudent ? "Logout?" : undefined}
        confirmLabel={isParent || isStudent ? "Logout" : undefined}
      />
    </header>
  );
}
