import { format } from "date-fns";
import { CalendarClock, CheckCircle2 } from "lucide-react";
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
  const student = complaint.students;
  const avatarUrl = student?.profiles?.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(student.profiles.avatar_path).data.publicUrl
    : undefined;
  const accent = slaAccentBorderClass(slaMeta(complaint).tone, complaint.status);

  return (
    <Card
      className={cn(
        "rounded-2xl border-border/80 border-l-4 bg-card shadow-xl transition-shadow hover:shadow-2xl",
        accent,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{complaint.complaint_number}</span>
            <span className="text-muted-foreground/50">·</span>
            <PriorityBadge priority={complaint.priority} />
            {complaint.complaint_categories?.name && (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {complaint.complaint_categories.name}
              </span>
            )}
          </div>
          <CardTitle className="truncate text-base sm:text-lg">{complaint.title}</CardTitle>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={complaint.status} />
          <SlaBadge complaint={complaint} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {student && (
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 border border-primary/30 shadow-sm">
              <AvatarImage src={avatarUrl} alt={student.full_name} />
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {student.full_name.trim()[0]?.toUpperCase() ?? "S"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{student.full_name}</span>
              {" · "}
              {student.admission_number}
              {complaint.rooms?.room_number ? ` · Room ${complaint.rooms.room_number}` : ""}
              {complaint.blocks?.name ? ` · ${complaint.blocks.name}` : ""}
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
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
            <span>
              <span className="font-semibold text-success">Resolution: </span>
              <span className="text-foreground">{complaint.resolution_summary}</span>
            </span>
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
