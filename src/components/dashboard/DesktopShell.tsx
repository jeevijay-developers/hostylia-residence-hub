import type { ReactNode } from "react";
import { Outlet } from "@tanstack/react-router";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RoleGuard } from "./RoleGuard";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { useResolvedRole, type AppRole } from "@/lib/user-role";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/dashboard-nav";

interface DesktopShellProps {
  allow: NonNullable<AppRole>[];
  navItems: NavItem[];
  showPropertySwitcher?: boolean;
  children?: ReactNode;
  /**
   * Renders a role-specific mobile bottom nav below `<main>` (e.g. Student's
   * StudentBottomNav) — opt-in only, every other caller leaves this unset
   * and gets today's exact behavior. The passed component is responsible for
   * its own `lg:hidden`/fixed positioning; this shell only adds matching
   * bottom padding to the content area so nothing sits behind it.
   */
  mobileBottomNav?: ReactNode;
  /** Hides Topbar's hamburger/Sheet mobile-nav trigger — used when mobileBottomNav replaces it. */
  hideMobileNavTrigger?: boolean;
  /**
   * Below `lg`, makes the header part of the same scrollable region as the
   * page content (instead of a fixed pane outside it) so it scrolls with the
   * content and re-sticks at the top threshold no matter where on the page
   * the scroll gesture starts — matching Warden's requested mobile behavior.
   * Opt-in only; every other caller is unaffected, and `lg:`+ is identical
   * either way.
   */
  mobileHeaderScrollsWithContent?: boolean;
}

export function DesktopShell({
  allow,
  navItems,
  showPropertySwitcher,
  children,
  mobileBottomNav,
  hideMobileNavTrigger,
  mobileHeaderScrollsWithContent,
}: DesktopShellProps) {
  const { data } = useResolvedRole();
  return (
    <RoleGuard allow={allow}>
      <ImpersonationBanner />
      <div className="flex h-dvh overflow-hidden bg-muted/30 lg:h-screen">
        <Sidebar
          items={navItems}
          showPropertySwitcher={showPropertySwitcher}
          tenantId={data?.tenantId ?? null}
        />
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col min-h-0",
            mobileHeaderScrollsWithContent ? "overflow-y-auto lg:overflow-hidden" : "overflow-hidden",
          )}
        >
          <Topbar
            navItems={navItems}
            showPropertySwitcher={showPropertySwitcher}
            tenantId={data?.tenantId ?? null}
            hideMobileNavTrigger={hideMobileNavTrigger}
          />
          <main
            className={cn(
              "overscroll-contain",
              mobileHeaderScrollsWithContent
                ? "lg:flex-1 lg:min-h-0 lg:overflow-y-auto"
                : "flex-1 min-h-0 overflow-y-auto",
            )}
          >
            <div
              className={cn(
                "mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8",
                mobileBottomNav && "pb-24 sm:pb-24 lg:pb-8",
              )}
            >
              {children ?? <Outlet />}
            </div>
          </main>
          {mobileBottomNav}
        </div>
      </div>
    </RoleGuard>
  );
}
