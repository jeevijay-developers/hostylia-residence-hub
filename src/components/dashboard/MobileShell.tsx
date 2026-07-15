import type { ReactNode } from "react";
import { Outlet } from "@tanstack/react-router";

import { MobileHeader } from "./MobileHeader";
import { BottomNav } from "./BottomNav";
import { RoleGuard } from "./RoleGuard";
import type { AppRole } from "@/lib/user-role";
import type { NavItem } from "@/lib/dashboard-nav";

interface MobileShellProps {
  allow: NonNullable<AppRole>[];
  navItems: NavItem[];
  children?: ReactNode;
}

export function MobileShell({ allow, navItems, children }: MobileShellProps) {
  return (
    <RoleGuard allow={allow}>
      <div className="flex min-h-screen flex-col bg-background">
        <MobileHeader />
        <main className="flex-1 px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-2xl">{children ?? <Outlet />}</div>
        </main>
        <BottomNav items={navItems} />
      </div>
    </RoleGuard>
  );
}
