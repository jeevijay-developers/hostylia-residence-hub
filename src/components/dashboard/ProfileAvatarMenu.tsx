import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface ProfileAvatarMenuProps {
  avatarUrl?: string;
  avatarInitial: string;
  /** Navigates to a dedicated profile route (Admin, Accountant, Warden, Parent, Student). */
  profileHref?: string;
  /** Runs custom behavior instead of navigating (e.g. Super Admin's Edit Profile dialog). */
  onProfileSelect?: () => void;
  /** Trigger avatar circle size — defaults to the desktop topbar's h-9 w-9. */
  triggerClassName?: string;
  /**
   * When true, the avatar itself is a direct link to `profileHref` — no
   * dropdown, no "My Profile" item. Sign Out is expected to live elsewhere
   * (e.g. somewhere else in the layout) since this mode has no menu to host
   * it. Requires `profileHref`.
   */
  asLink?: boolean;
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
  triggerClassName,
  asLink,
}: ProfileAvatarMenuProps) {
  const triggerContent = avatarUrl ? (
    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    avatarInitial
  );
  const triggerVisualClassName = cn(
    "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary shadow-tone-glow ring-2 ring-primary/40 outline-none transition hover:ring-primary/60",
    triggerClassName,
  );

  if (profileHref) {
    return (
      <Link to={profileHref} aria-label="My Profile" className={triggerVisualClassName}>
        {triggerContent}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onProfileSelect?.();
      }}
      aria-label="My Profile"
      className={triggerVisualClassName}
    >
      {triggerContent}
    </button>
  );
}
