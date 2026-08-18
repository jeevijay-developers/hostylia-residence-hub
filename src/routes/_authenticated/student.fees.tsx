import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StudentFeesList } from "@/components/finance/StudentFeesList";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/student/fees")({
  component: StudentFeesPage,
});

function StudentFeesPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId;
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
  if (!q.data) return <p className="p-6 text-sm text-muted-foreground">Student profile not linked.</p>;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Your invoices and payment history."
        description="View and manage your payments in one place."
      />
      <StudentFeesList studentId={q.data.id} />
      <div className="flex items-start gap-3 rounded-xl border border-border p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info/15 text-info">
          <Info className="h-4 w-4" />
        </span>
        <p className="text-sm">
          <span className="font-medium text-foreground">Online payment powered by Razorpay.</span>{" "}
          <span className="text-muted-foreground">
            If the pay button fails, ask your admin to configure Razorpay keys.
          </span>
        </p>
      </div>
    </div>
  );
}
