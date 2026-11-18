import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, CENTER_NAV, type NavItem } from "@/lib/dashboard-nav";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { KycLockedPanel } from "@/components/students/KycLockedPanel";
import { isKycGatedStudentPath, useKycComplete } from "@/lib/kyc";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions, type StudentModule } from "@/lib/staff-scope";

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
  const { can: canModule } = useStudentPermissions();

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

  // KYC gate: until verified, every module entry stays visible but locked, and
  // every route except Home/Profile renders a lock panel instead of the page.
  // Fails closed while loading or on error. RLS (is_student_kyc_verified) is
  // the real boundary — this is the UX layer on top of it.
  const studentId = gateQ.data?.studentId ?? null;
  const kyc = useKycComplete(studentId);
  const kycLocked = !!studentId && !kyc.complete;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routeBlocked = kycLocked && isKycGatedStudentPath(pathname);
  // Nav locks only once the status is known, so verified students don't see a
  // lock flash on load; the route itself stays blocked until then.
  const lockIfNeeded = (item: NavItem): NavItem =>
    kycLocked && !kyc.isLoading && item.module ? { ...item, locked: true } : item;

  const moduleFilter = (item: NavItem) =>
    !item.module || canModule(item.module as StudentModule, "view");
  const navItems: NavItem[] = pending
    ? []
    : (SIDEBAR_NAV.STUDENT ?? []).filter(moduleFilter).map(lockIfNeeded);
  const bottomItems: NavItem[] = pending
    ? []
    : (BOTTOM_NAV.STUDENT ?? []).filter(moduleFilter).map(lockIfNeeded);
  const rawCenter = CENTER_NAV.STUDENT;
  const centerItem: NavItem | undefined =
    pending ||
    !rawCenter ||
    (rawCenter.module && !canModule(rawCenter.module as StudentModule, "view"))
      ? undefined
      : lockIfNeeded(rawCenter);

  return (
    <DesktopShell
      allow={["STUDENT"]}
      navItems={navItems}
      hideMobileNavTrigger
      mobileHeaderScrollsWithContent
      mobileBottomNav={<StudentBottomNav items={bottomItems} centerItem={centerItem} />}
    >
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
      ) : routeBlocked ? (
        kyc.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <KycLockedPanel status={kyc.status} />
        )
      ) : (
        <Outlet />
      )}
    </DesktopShell>
  );
}
