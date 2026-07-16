import type { ReactNode } from "react";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { MobileHeader } from "./MobileHeader";
import { BottomNav } from "./BottomNav";
import { RoleGuard } from "./RoleGuard";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import type { AppRole } from "@/lib/user-role";
import type { NavItem } from "@/lib/dashboard-nav";

interface MobileShellProps {
  allow: NonNullable<AppRole>[];
  navItems: NavItem[];
  children?: ReactNode;
}

export function MobileShell({ allow, navItems, children }: MobileShellProps) {
  const { i18n } = useTranslation();
  const langAttr = i18n.language?.startsWith("hi") ? "hi" : "en";
  return (
    <RoleGuard allow={allow}>
      <div className="flex min-h-screen flex-col bg-background" lang={langAttr}>
        <MobileHeader />
        <main className="flex-1 px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-2xl">{children ?? <Outlet />}</div>
        </main>
        <BottomNav items={navItems} />
      </div>
    </RoleGuard>
  );
}

