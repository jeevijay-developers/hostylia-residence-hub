import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useResolvedRole, type AppRole } from "@/lib/user-role";

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
