import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";

export function AttendanceHistoryList({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["parent-attendance", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*")
        .eq("student_id", studentId)
        .order("attendance_date", { ascending: false }).limit(30);
      return data ?? [];
    },
  });
  if (q.isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!q.data?.length) return <EmptyState title={t("parent.attendance.emptyTitle")} description={t("parent.attendance.emptyBody")} />;
  return (
    <div className="divide-y rounded border">
      {q.data.map((a) => (
        <div key={a.id} className="p-3 flex justify-between text-sm">
          <span>{a.attendance_date} · {a.session}</span>
          <Badge variant={a.status === "PRESENT" ? "secondary" : a.status === "ABSENT" ? "destructive" : "outline"}>{a.status}</Badge>
        </div>
      ))}
    </div>
  );
}
