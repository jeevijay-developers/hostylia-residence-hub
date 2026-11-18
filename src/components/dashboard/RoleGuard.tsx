import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useResolvedRole, type AppRole } from "@/lib/user-role";
import {
  useStudentPermissions,
  useWardenPermissions,
  useAccountantPermissions,
  type StudentModule,
} from "@/lib/staff-scope";

interface RoleGuardProps {
  allow: NonNullable<AppRole>[];
  children: ReactNode;
}

/**
 * UX-only route guard per Architecture.md Sec 7.1 — RLS remains the real
 * security boundary. Redirects mismatched roles to /403.
 */
export function RoleGuard({ allow, children }: RoleGuardProps) {
  const { data, isLoading } = useResolvedRole();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const role = data?.role;
  if (!role || !allow.includes(role)) {
    return <Navigate to="/403" />;
  }
  return <>{children}</>;
}

interface StudentModuleGuardProps {
  module: StudentModule;
  children: ReactNode;
}

/**
 * Same UX-only redirect-to-/403 pattern as RoleGuard, gating on a student's
 * per-module permission (see useStudentPermissions in staff-scope.ts)
 * instead of role membership. RLS (can_student_view_*) is the real
 * boundary — this only keeps a No-Access student from seeing a route whose
 * queries would return empty/error anyway.
 */
export function StudentModuleGuard({ module, children }: StudentModuleGuardProps) {
  const { data: role, isLoading: roleLoading } = useResolvedRole();
  const { can, isLoading: permsLoading } = useStudentPermissions();

  if (roleLoading || (role?.role === "STUDENT" && permsLoading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (role?.role === "STUDENT" && !can(module, "view")) {
    return <Navigate to="/403" />;
  }
  return <>{children}</>;
}

interface StaffModuleGuardProps {
  role: "WARDEN" | "ACCOUNTANT";
  /** A PermissionKey from admin.staff.tsx's custom-permission matrix
   * (e.g. "attendance_view", "fee_plans_view", "reports_view"). */
  module: string;
  children: ReactNode;
}

/**
 * Blocks direct route access to a Warden/Accountant module page the signed-in
 * staff member hasn't been granted — same UX-only redirect-to-/403 pattern as
 * RoleGuard/StudentModuleGuard above, keeping "no permission -> hidden from
 * nav AND unreachable by URL" consistent. can_manage_()/can_view_() RLS is
 * the real boundary underneath; this only stops a No-Access staff member from
 * loading a page whose queries would return empty/error anyway.
 */
export function StaffModuleGuard({ role, module, children }: StaffModuleGuardProps) {
  const warden = useWardenPermissions();
  const accountant = useAccountantPermissions();
  const { can, isLoading } = role === "WARDEN" ? warden : accountant;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!can(module)) {
    return <Navigate to="/403" />;
  }
  return <>{children}</>;
}
