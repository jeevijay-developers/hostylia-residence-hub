import {
  CalendarClock,
  CircleCheck,
  CircleSlash,
  Clock,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

import { DESIGNATION_LABEL, type StaffDesignation } from "@/lib/property-staff";
import { cn } from "@/lib/utils";
import { DESIGNATION_ICON, avatarTone, initials } from "./staff-meta";

/** Role chip: designation label + its icon. */
export function DesignationChip({ designation }: { designation: StaffDesignation }) {
  const Icon = DESIGNATION_ICON[designation];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/80 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {DESIGNATION_LABEL[designation]}
    </span>
  );
}

export type StaffPillStatus = "ACTIVE" | "ON_LEAVE" | "INACTIVE" | "INVITED";

const STATUS_META: Record<StaffPillStatus, { label: string; icon: LucideIcon; className: string }> =
  {
    ACTIVE: { label: "Active", icon: CircleCheck, className: "bg-success/10 text-success" },
    ON_LEAVE: { label: "On leave", icon: CalendarClock, className: "bg-warning/10 text-warning" },
    INACTIVE: {
      label: "Inactive",
      icon: CircleSlash,
      className: "bg-muted text-muted-foreground",
    },
    INVITED: { label: "Invited", icon: Clock, className: "bg-info/10 text-info" },
  };

/** Staff status — always colour + icon + label. */
export function StaffStatusPill({ status }: { status: StaffPillStatus }) {
  const s = STATUS_META[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
      )}
      title={status === "INVITED" ? "App login invited — not signed in yet" : undefined}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** "Login" badge: the person has (or is being given) an app login. */
export function LoginBadge({ hint }: { hint: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info"
      title={hint}
    >
      <KeyRound className="h-3 w-3" aria-hidden="true" />
      Login
    </span>
  );
}

export function StaffAvatar({
  id,
  name,
  size = "md",
}: {
  id: string;
  name: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs",
        avatarTone(id),
      )}
      aria-hidden="true"
    >
      {initials(name) || "?"}
    </span>
  );
}
