import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  MessageSquareWarning,
  Sparkles,
  Utensils,
  Wifi,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PriorityBadge,
  SlaBadge,
  StatusBadge,
  slaAccentBorderClass,
} from "@/components/complaints/SlaBadge";
import { supabase } from "@/integrations/supabase/client";
import { slaMeta, type ComplaintWithRelations } from "@/lib/complaint";
import { cn, type SemanticTone } from "@/lib/utils";
import type { ComplaintPriority } from "@/schemas/complaint";

const DATE_FORMAT = "d MMM yyyy, h:mm a";

const PRIORITY_TONE: Record<ComplaintPriority, SemanticTone> = {
  LOW: "muted",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "destructive",
};

const ICON_BOX_TONE: Record<SemanticTone, string> = {
  primary: "bg-primary/10 text-primary border-primary/30",
  success: "bg-success/10 text-success border-success/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  info: "bg-info/10 text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
};

/** Purely decorative — picks a representative icon from the category name so
 * the card reads at a glance, no data model change involved. */
function categoryIcon(categoryName: string | null | undefined): LucideIcon {
  const n = (categoryName ?? "").toLowerCase();
  if (/wifi|network|internet/.test(n)) return Wifi;
  if (/mess|food|kitchen/.test(n)) return Utensils;
  if (/clean|housekeep/.test(n)) return Sparkles;
  if (/maint|repair|electric|plumb/.test(n)) return Wrench;
  return MessageSquareWarning;
}

/**
 * Parent-facing complaint card — a restyled, read-only presentation of the
 * same `ComplaintWithRelations` data the shared `complaints/ComplaintCard`
 * renders for admin/warden/student. Kept as its own component (instead of
 * changing the shared one) so this visual pass stays scoped to the Parent
 * portal and doesn't touch the admin/warden/student complaint screens.
 */
export function ComplaintCard({ complaint }: { complaint: ComplaintWithRelations }) {
  const studentName = complaint.student_full_name;
  const avatarUrl = complaint.student_avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(complaint.student_avatar_path).data.publicUrl
    : undefined;
  const accent = slaAccentBorderClass(slaMeta(complaint).tone, complaint.status);
  const tone = PRIORITY_TONE[complaint.priority as ComplaintPriority] ?? "muted";
  const Icon = categoryIcon(complaint.category_name);

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/80 border-l-4 bg-card shadow-card-ambient",
        accent,
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl border",
              ICON_BOX_TONE[tone],
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{complaint.complaint_number}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <PriorityBadge priority={complaint.priority} />
                </div>
                {complaint.category_name && (
                  <span className="mt-1.5 inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {complaint.category_name}
                  </span>
                )}
                <p className="mt-1.5 truncate font-display text-base font-semibold text-foreground sm:text-lg">
                  {complaint.title}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge status={complaint.status} />
                <SlaBadge complaint={complaint} />
              </div>
            </div>

            {studentName && (
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8 border border-primary/30 shadow-sm">
                  <AvatarImage src={avatarUrl} alt={studentName} />
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {studentName.trim()[0]?.toUpperCase() ?? "S"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{studentName}</span>
                  {" · "}
                  {complaint.student_admission_number}
                  {complaint.room_number ? ` · Room ${complaint.room_number}` : ""}
                  {complaint.block_name ? ` · ${complaint.block_name}` : ""}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Raised {format(new Date(complaint.created_at), DATE_FORMAT)}
              </span>
              {complaint.resolved_at && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Resolved {format(new Date(complaint.resolved_at), DATE_FORMAT)}
                  </span>
                </>
              )}
            </div>

            <p className="line-clamp-3 text-sm text-muted-foreground">{complaint.description}</p>

            {complaint.resolution_summary && (
              <div className="inline-flex items-start gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-success">Resolution: </span>
                  <span className="text-foreground">{complaint.resolution_summary}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
