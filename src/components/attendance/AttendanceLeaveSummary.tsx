import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface MonthlySummary {
  attendance_pct: number | null;
  marked_days: number;
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Student Home: this month's attendance % plus shortcuts into the existing
 * /student/attendance page (report + Request Leave form). The % comes from
 * v_attendance_monthly_summary — the same view and query key as
 * MonthlyAttendanceReport — so Late counts as Present and approved leave is
 * excluded; nothing is recalculated here.
 */
export function AttendanceLeaveSummary({ studentId }: { studentId: string }) {
  const monthStart = currentMonthStart();
  const q = useQuery({
    queryKey: ["attendance-monthly-summary", studentId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_attendance_monthly_summary" as never)
        .select("*")
        .eq("student_id", studentId)
        .eq("month", monthStart)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as MonthlySummary | null;
    },
  });

  const pct = q.data?.attendance_pct ?? null;
  const caption = "Monthly attendance";
  let hint = "Late counts as present · approved leave is not counted.";
  if (q.isError) {
    hint = "Attendance is unavailable right now.";
  } else if (!q.isLoading && !q.data) {
    hint = "No attendance recorded yet this month.";
  } else if (!q.isLoading && pct === null) {
    hint = "No present or absent days recorded yet this month.";
  }

  return (
    <section aria-labelledby="attendance-leave-heading" className="space-y-3">
      <h2 id="attendance-leave-heading" className="font-display text-xl font-bold text-foreground">
        Attendance &amp; Leave
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CalendarCheck className="h-6 w-6 text-warning" />
          {q.isLoading ? (
            <Skeleton className="mt-3 h-8 w-20" />
          ) : (
            <span className="mt-3 block text-3xl font-bold text-foreground">
              {q.isError || pct === null ? "—" : `${pct}%`}
            </span>
          )}
          <span className="mt-0.5 block text-sm text-muted-foreground">{caption}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-10">
            <Link to="/student/attendance" hash="leave-request">
              <CalendarPlus className="h-4 w-4" /> Request Leave
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-10">
            <Link to="/student/attendance">
              <CalendarCheck className="h-4 w-4" /> View Attendance
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
