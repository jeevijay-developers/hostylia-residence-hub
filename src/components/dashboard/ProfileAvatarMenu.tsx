import { Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProfileAvatarMenuProps {
  avatarUrl?: string;
  avatarInitial: string;
  /** Navigates to a dedicated profile route (Admin, Accountant, Warden, Parent, Student). */
  profileHref?: string;
  /** Runs custom behavior instead of navigating (e.g. Super Admin's Edit Profile dialog). */
  onProfileSelect?: () => void;
  onSignOut: () => void;
  /** Trigger avatar circle size — defaults to the desktop topbar's h-9 w-9. */
  triggerClassName?: string;
}

/**
 * The single finalized avatar dropdown used across every dashboard role —
 * exactly 2 items (My Profile, Sign Out), no subtitles, no extra options.
 * Only the destination/behavior of "My Profile" varies per role.
 */
export function ProfileAvatarMenu({
  avatarUrl,
  avatarInitial,
  profileHref,
  onProfileSelect,
  onSignOut,
  triggerClassName,
}: ProfileAvatarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary shadow-tone-glow ring-2 ring-primary/40 outline-none transition hover:ring-primary/60 data-[state=open]:ring-primary/70",
          triggerClassName,
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          avatarInitial
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[200px] rounded-[10px] border-border/70 p-1.5 shadow-xl duration-150"
      >
        <DropdownMenuItem
          asChild={!!profileHref}
          className="cursor-pointer rounded-lg px-2.5 py-2 focus:bg-muted"
          onSelect={
            !profileHref
              ? (e) => {
                  e.preventDefault();
                  onProfileSelect?.();
                }
              : undefined
          }
        >
          {profileHref ? (
            <Link to={profileHref} className="flex items-center gap-2.5">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">My Profile</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <>
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">My Profile</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          className="cursor-pointer rounded-lg px-2.5 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={(e) => {
            e.preventDefault();
            onSignOut();
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
