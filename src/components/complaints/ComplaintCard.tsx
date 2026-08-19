import { format } from "date-fns";
import { CalendarClock, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriorityBadge, SlaBadge, StatusBadge, slaAccentBorderClass } from "./SlaBadge";
import { supabase } from "@/integrations/supabase/client";
import { slaMeta, type ComplaintWithRelations } from "@/lib/complaint";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const DATE_FORMAT = "d MMM yyyy, h:mm a";

export function ComplaintCard({
  complaint,
  actions,
}: {
  complaint: ComplaintWithRelations;
  actions?: ReactNode;
}) {
  const avatarUrl = complaint.student_avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(complaint.student_avatar_path).data.publicUrl
    : undefined;
  const accent = slaAccentBorderClass(slaMeta(complaint).tone, complaint.status);

  return (
    <Card className={cn("border-l-4", accent)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{complaint.complaint_number}</span>
            <span>·</span>
            <PriorityBadge priority={complaint.priority} />
            {complaint.category_name && (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {complaint.category_name}
              </span>
            )}
          </div>
          <CardTitle className="truncate text-base">{complaint.title}</CardTitle>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={complaint.status} />
          <SlaBadge complaint={complaint} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {complaint.is_anonymous ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                <EyeOff className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Anonymous student</span>
              {complaint.room_number ? ` · Room ${complaint.room_number}` : ""}
              {complaint.block_name ? ` · ${complaint.block_name}` : ""}
            </div>
          </div>
        ) : (
          complaint.student_full_name && (
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={avatarUrl} alt={complaint.student_full_name} />
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {complaint.student_full_name.trim()[0]?.toUpperCase() ?? "S"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{complaint.student_full_name}</span>
                {complaint.student_admission_number
                  ? ` · ${complaint.student_admission_number}`
                  : ""}
                {complaint.room_number ? ` · Room ${complaint.room_number}` : ""}
                {complaint.block_name ? ` · ${complaint.block_name}` : ""}
              </div>
            </div>
          )
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Raised {format(new Date(complaint.created_at), DATE_FORMAT)}
          </span>
          {complaint.resolved_at && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Resolved {format(new Date(complaint.resolved_at), DATE_FORMAT)}
            </span>
          )}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{complaint.description}</p>
        {complaint.resolution_summary && (
          <div className="inline-flex items-start gap-1 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-success">Resolution:</span>
            <span className="text-foreground">{complaint.resolution_summary}</span>
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
