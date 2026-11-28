import { Archive, CircleCheck, Clock, Flag, Users, type LucideIcon } from "lucide-react";

import {
  CATEGORY_META,
  CHANNEL_META,
  archivedReason,
  audienceText,
} from "@/components/hostel/notices/notice-meta";

import type { NoticeCategory, NoticeChannelKey } from "@/lib/notice-defaults";
import { formatIstDateTime } from "@/lib/ist";
import type { NoticePhase, PropertyNotice } from "@/lib/property-notices";
import { cn } from "@/lib/utils";

export function CategoryIconTile({ category }: { category: NoticeCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", meta.className)}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function CategoryChip({ category }: { category: NoticeCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const PHASE_META: Record<NoticePhase, { label: string; icon: LucideIcon; className: string }> = {
  ACTIVE: { label: "Active", icon: CircleCheck, className: "bg-success/10 text-success" },
  SCHEDULED: { label: "Scheduled", icon: Clock, className: "bg-info/10 text-info" },
  ARCHIVED: { label: "Archived", icon: Archive, className: "bg-muted text-muted-foreground" },
};

export function NoticeStatusPill({
  notice,
  phase,
}: {
  notice: PropertyNotice;
  phase: NoticePhase;
}) {
  const meta = PHASE_META[phase];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className,
      )}
      title={phase === "ARCHIVED" ? archivedReason(notice) : undefined}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: string }) {
  if (priority !== "IMPORTANT" && priority !== "URGENT") return null;
  const urgent = priority === "URGENT";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        urgent ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
      )}
    >
      <Flag className="h-3 w-3" aria-hidden="true" />
      {urgent ? "Urgent" : "Important"}
    </span>
  );
}

export function AudienceCell({ notice }: { notice: PropertyNotice }) {
  return (
    // One line (audience, then its channels), so it lines up with the other single-line columns.
    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm text-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {audienceText(notice)}
      </span>
      <ChannelIcons channels={notice.channels} className="border-l border-border pl-2" />
    </div>
  );
}

function ChannelIcons({ channels, className }: { channels: string[]; className?: string }) {
  const known = (Object.keys(CHANNEL_META) as NoticeChannelKey[]).filter((c) =>
    channels.includes(c),
  );
  if (known.length === 0) return null;
  return (
    <span
      className={cn("flex items-center gap-1.5 text-muted-foreground", className)}
      role="img"
      aria-label={`Channels: ${known.map((c) => CHANNEL_META[c].label).join(", ")}`}
    >
      {known.map((c) => {
        const Icon = CHANNEL_META[c].icon;
        return (
          <span key={c} title={CHANNEL_META[c].label}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}

/**
 * "Published on" column: when it went out, or when it is due to (the status pill says which). The date is
 * always the first line, so it lines up across rows; at most one muted line follows it.
 */
export function NoticeWhen({
  notice,
  phase,
  className,
}: {
  notice: PropertyNotice;
  phase: NoticePhase;
  className?: string;
}) {
  const when = notice.published_at ?? notice.publish_at;
  const note =
    notice.expires_at && phase !== "ARCHIVED"
      ? `Expires ${formatIstDateTime(notice.expires_at)}`
      : !notice.published_at && phase === "ARCHIVED"
        ? "Never sent"
        : null;
  return (
    <div className={cn("min-w-0 text-sm", className)}>
      <p className="whitespace-nowrap text-foreground">
        {when ? formatIstDateTime(when) : "Not scheduled"}
      </p>
      {note ? <p className="whitespace-nowrap text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
