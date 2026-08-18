import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type AttendanceRecord = Tables<"attendance">;

// Only these statuses carry a reason worth surfacing — matches the
// requirement (notes are mandatory) enforced in bulkMarkAttendance's schema.
const REASON_STATUSES = ["ABSENT", "ON_LEAVE"];

export function AttendanceHistoryList({
  studentId,
  emptyTitle,
  emptyDescription,
}: {
  studentId: string;
  /** Overrides the default parent-facing copy — e.g. the student's own
   * attendance view shouldn't talk about "your child" or imply a hostel-side
   * activation toggle that doesn't exist. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["parent-attendance", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .order("attendance_date", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });
  if (q.isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!q.data?.length)
    return (
      <EmptyState
        title={emptyTitle ?? t("parent.attendance.emptyTitle")}
        description={emptyDescription ?? t("parent.attendance.emptyBody")}
      />
    );
  return (
    <div className="divide-y rounded border">
      {q.data.map((a) => (
        <AttendanceRow key={a.id} record={a} />
      ))}
    </div>
  );
}

function AttendanceRow({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasReasonField = REASON_STATUSES.includes(record.status);
  const reasonText = record.notes?.trim() ? record.notes : t("parent.attendance.noReasonRecorded");

  const row = (
    <div className="flex items-center justify-between gap-2">
      <span>
        {record.attendance_date} · {record.session}
      </span>
      <div className="flex items-center gap-2">
        <Badge
          variant={
            record.status === "PRESENT"
              ? "secondary"
              : record.status === "ABSENT"
                ? "destructive"
                : "outline"
          }
        >
          {record.status}
        </Badge>
        {hasReasonField && (
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
        )}
      </div>
    </div>
  );

  if (!hasReasonField) {
    return <div className="p-3 text-sm">{row}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="p-3 text-sm">
      {row}
      <CollapsibleContent className="pt-2">
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          {reasonText}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
