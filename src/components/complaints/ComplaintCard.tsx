import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SlaBadge, StatusBadge } from "./SlaBadge";
import { supabase } from "@/integrations/supabase/client";
import type { ComplaintWithRelations } from "@/lib/complaint";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{complaint.complaint_number}</span>
            <span>·</span>
            <span>{complaint.priority}</span>
            {complaint.complaint_categories?.name && (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {complaint.complaint_categories.name}
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
        {student && (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarUrl} alt={student.full_name} />
              <AvatarFallback className="text-xs">
                {student.full_name.trim()[0]?.toUpperCase() ?? "S"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{student.full_name}</span>
              {" · "}
              {student.admission_number}
              {complaint.rooms?.room_number ? ` · Room ${complaint.rooms.room_number}` : ""}
              {complaint.blocks?.name ? ` · ${complaint.blocks.name}` : ""}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Raised {format(new Date(complaint.created_at), DATE_FORMAT)}</span>
          {complaint.resolved_at && (
            <span>Resolved {format(new Date(complaint.resolved_at), DATE_FORMAT)}</span>
          )}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{complaint.description}</p>
        {complaint.resolution_summary && (
          <div className="rounded-md border border-success/30 bg-success/5 p-2 text-xs">
            <span className="font-semibold text-success">Resolution:</span>{" "}
            {complaint.resolution_summary}
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
