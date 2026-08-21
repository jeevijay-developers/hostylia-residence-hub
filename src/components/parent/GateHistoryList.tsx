import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DoorOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toneClasses } from "@/lib/utils";

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

  if (q.isLoading)
    return (
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    );
  if (!q.data?.length) {
    return (
      <EmptyState
        title={t("parent.gateHistory.emptyTitle")}
        description={t("parent.gateHistory.emptyBody")}
      />
    );
  }
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {q.data.map((e) => (
        <div key={e.id} className="flex items-center gap-3 p-4">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${toneClasses.primary}`}>
            <DoorOpen className="h-4 w-4" />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {new Date(e.event_at).toLocaleString()}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {e.is_late && (
              <Badge variant="destructive" className="rounded-full">
                {t("parent.gateHistory.late")}
              </Badge>
            )}
            <Badge variant="outline" className="rounded-full">
              {e.direction === "IN" ? t("parent.gateHistory.in") : t("parent.gateHistory.out")}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
