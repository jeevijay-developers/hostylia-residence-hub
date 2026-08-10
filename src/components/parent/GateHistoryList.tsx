import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";

export function GateHistoryList({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["parent-gate-history", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("gate_events")
        .select("id, direction, event_at, is_late")
        .eq("student_id", studentId)
        .order("event_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!q.data?.length) {
    return (
      <EmptyState
        title={t("parent.gateHistory.emptyTitle")}
        description={t("parent.gateHistory.emptyBody")}
      />
    );
  }
  return (
    <div className="divide-y rounded border">
      {q.data.map((e) => (
        <div key={e.id} className="p-3 flex items-center justify-between text-sm">
          <span>{new Date(e.event_at).toLocaleString()}</span>
          <div className="flex items-center gap-2">
            {e.is_late && <Badge variant="destructive">{t("parent.gateHistory.late")}</Badge>}
            <Badge variant={e.direction === "IN" ? "secondary" : "outline"}>
              {e.direction === "IN" ? t("parent.gateHistory.in") : t("parent.gateHistory.out")}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
