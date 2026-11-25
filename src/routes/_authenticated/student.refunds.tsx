import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import { StudentRefundRequestForm } from "@/components/finance/StudentRefundRequestForm";
import { StudentRefundHistory } from "@/components/finance/StudentRefundHistory";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/student/refunds")({
  head: () => ({ meta: [{ title: "Refunds — Hostylia" }] }),
  component: StudentRefundsPage,
});

function StudentRefundsPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId;
  const { can } = useStudentPermissions();
  const q = useQuery({
    queryKey: ["student-self", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!q.data)
    return <p className="p-6 text-sm text-muted-foreground">Student profile not linked.</p>;

  const canRequest = can("finance", "edit");

  return (
    <StudentModuleGuard module="finance">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
        {canRequest ? (
          <StudentRefundRequestForm studentId={q.data.id} />
        ) : (
          <p className="rounded-2xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">
            You don't have access to submit refund requests.
          </p>
        )}
        <StudentRefundHistory studentId={q.data.id} />
      </div>
    </StudentModuleGuard>
  );
}
