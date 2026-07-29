import type { ReactNode } from "react";
import { Outlet } from "@tanstack/react-router";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RoleGuard } from "./RoleGuard";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { useResolvedRole, type AppRole } from "@/lib/user-role";
import type { NavItem } from "@/lib/dashboard-nav";

interface DesktopShellProps {
  allow: NonNullable<AppRole>[];
  navItems: NavItem[];
  showPropertySwitcher?: boolean;
  children?: ReactNode;
}

export function DesktopShell({
  allow,
  navItems,
  showPropertySwitcher,
  children,
}: DesktopShellProps) {
  const { data } = useResolvedRole();
  return (
    <RoleGuard allow={allow}>
      <ImpersonationBanner />
      <div className="flex min-h-screen bg-muted/30">
        <Sidebar
          items={navItems}
          showPropertySwitcher={showPropertySwitcher}
          tenantId={data?.tenantId ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar navItems={navItems} />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
              {children ?? <Outlet />}
            </div>
          </main>
        </div>
      </div>
    </RoleGuard>
  );
}
