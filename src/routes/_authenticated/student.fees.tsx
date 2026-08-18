import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  if (!q.data)
    return <p className="p-6 text-sm text-muted-foreground">Student profile not linked.</p>;

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Fees" description="Your invoices and payment history." />
      <StudentFeesList studentId={q.data.id} />
      <p className="text-xs text-muted-foreground">
        Online payment powered by Razorpay. If the pay button fails, ask your admin to configure
        Razorpay keys.
      </p>
    </div>
  );
}
