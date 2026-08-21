import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type AttendanceRecord = Tables<"attendance">;

// Only these statuses carry a reason worth surfacing — matches the
// requirement (notes are mandatory) enforced in bulkMarkAttendance's schema.
const REASON_STATUSES = ["ABSENT", "ON_LEAVE"];

/**
 * Parent-facing attendance history — a restyled fork of the shared
 * `parent/AttendanceHistoryList` (also used by the Student Attendance page),
 * kept separate so this visual pass doesn't affect that screen. Same query,
 * same reason-expand behavior — only the row/table chrome differs.
 */
export function AttendanceRecordsList({ studentId }: { studentId: string }) {
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

  if (q.isLoading)
    return (
      <Card className="divide-y divide-border overflow-hidden rounded-2xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    );

  if (!q.data?.length)
    return (
      <EmptyState
        title={t("parent.attendance.emptyTitle")}
        description={t("parent.attendance.emptyBody")}
      />
    );

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
        <span className="flex-1">Date</span>
        <span className="w-24">Session</span>
        <span className="w-28 text-right">Status</span>
      </div>
      <div className="divide-y divide-border">
        {q.data.map((a) => (
          <AttendanceRow key={a.id} record={a} />
        ))}
      </div>
    </Card>
  );
}

function AttendanceRow({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasReasonField = REASON_STATUSES.includes(record.status);
  const reasonText = record.notes?.trim() ? record.notes : t("parent.attendance.noReasonRecorded");

  const row = (
    <div className="flex items-center justify-between gap-3">
      <span className="flex-1 text-sm text-foreground">{record.attendance_date}</span>
      <span className="w-24 text-sm text-muted-foreground">{record.session}</span>
      <div className="flex w-28 items-center justify-end gap-1.5">
        <Badge
          variant={
            record.status === "PRESENT"
              ? "info"
              : record.status === "ABSENT"
                ? "destructive"
                : "outline"
          }
          className="rounded-full"
        >
          {record.status}
        </Badge>
        {hasReasonField && (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Toggle reason"
            >
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
    return <div className="p-4">{row}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="p-4">
      {row}
      <CollapsibleContent className="pt-3">
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-destructive">Reason</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{reasonText}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
