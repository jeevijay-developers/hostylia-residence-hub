import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { MobileShell } from "@/components/dashboard/MobileShell";
import { BOTTOM_NAV } from "@/lib/dashboard-nav";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/student")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: StudentLayout,
});

/**
 * Blocks every /student/* route behind an unsigned boarding agreement — a
 * student can't reach Fees/Gate Pass/Mess/Complaints until they've accepted
 * it, since this layout wraps all of those routes' Outlet.
 */
function StudentLayout() {
  const qc = useQueryClient();
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;

  const gateQ = useQuery({
    queryKey: ["student-agreement-gate", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!student) return { studentId: null as string | null, pending: false };

      const { data: agreement } = await supabase
        .from("agreements")
        .select("status")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { studentId: student.id, pending: !!agreement && agreement.status !== "SIGNED" };
    },
  });

  const pending = gateQ.data?.pending ?? false;
  const navItems = pending ? [] : (BOTTOM_NAV.STUDENT ?? []);

  return (
    <MobileShell allow={["STUDENT"]} navItems={navItems}>
      {gateQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pending && gateQ.data?.studentId ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Accept your boarding agreement to unlock fees, gate pass, mess and complaints.
          </p>
          <AgreementViewer
            studentId={gateQ.data.studentId}
            onAccepted={() =>
              qc.invalidateQueries({ queryKey: ["student-agreement-gate", userId] })
            }
          />
        </div>
      ) : (
        <Outlet />
      )}
    </MobileShell>
  );
}
