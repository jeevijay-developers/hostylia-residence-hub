import type { ReactNode } from "react";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { MobileHeader } from "./MobileHeader";
import { BottomNav } from "./BottomNav";
import { RoleGuard } from "./RoleGuard";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/user-role";
import type { NavItem } from "@/lib/dashboard-nav";

interface MobileShellProps {
  allow: NonNullable<AppRole>[];
  navItems: NavItem[];
  centerElevated?: boolean;
  children?: ReactNode;
}

export function MobileShell({ allow, navItems, centerElevated, children }: MobileShellProps) {
  const { i18n } = useTranslation();
  const langAttr = i18n.language?.startsWith("hi") ? "hi" : "en";
  return (
    <RoleGuard allow={allow}>
      <div className="flex min-h-screen flex-col bg-background" lang={langAttr}>
        <ImpersonationBanner />
        <MobileHeader />
        <main className={cn("flex-1 px-4 py-5 sm:px-6", navItems.length > 0 && "pb-24")}>
          <div className="mx-auto w-full max-w-2xl">{children ?? <Outlet />}</div>
        </main>
        <BottomNav items={navItems} centerElevated={centerElevated} />
      </div>
    </RoleGuard>
  );
}

