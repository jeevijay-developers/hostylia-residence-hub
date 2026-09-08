import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, IndianRupee, Info, Zap } from "lucide-react";
import { StudentFeesList } from "@/components/finance/StudentFeesList";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/student/fees")({
  component: StudentFeesPage,
});

function StudentFeesPage() {
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
  if (!q.data) return <p className="p-6 text-sm text-muted-foreground">Student profile not linked.</p>;

  const canPay = can("finance", "edit");

  return (
    <StudentModuleGuard module="finance">
      <div className="space-y-4 p-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xl sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fees &amp; Payments
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                Your invoices and payment history.
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                View and manage your payments in one place.
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <div className="relative h-16 w-16 shrink-0">
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-info/15 text-info">
                  <IndianRupee className="h-7 w-7" />
                </span>
                <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
                  <CreditCard className="h-4 w-4" />
                </span>
              </div>
              <p className="text-sm font-medium leading-snug text-muted-foreground">
                Simple.
                <br />
                Secure.
                <br />
                Hassle-free.
              </p>
            </div>
          </div>
        </div>

        <StudentFeesList studentId={q.data.id} canPay={canPay} />

        {canPay && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info/15 text-info">
              <Info className="h-4 w-4" />
            </span>
            <p className="flex-1 text-sm">
              <span className="font-medium text-foreground">Online payment powered by Razorpay.</span>{" "}
              <span className="text-muted-foreground">
                If the pay button fails, ask your admin to configure Razorpay keys.
              </span>
            </p>
            <span className="hidden shrink-0 items-center gap-1 text-sm font-bold italic text-info sm:flex">
              <Zap className="h-4 w-4 fill-current" />
              Razorpay
            </span>
          </div>
        )}
      </div>
    </StudentModuleGuard>
  );
}
