import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, MORE_NAV, CENTER_NAV } from "@/lib/dashboard-nav";

function AccountantLayout() {
  // Lock html/body scroll while on the Accountant section so only the
  // DesktopShell's main content area scrolls; restore on unmount so other
  // (non-sidebar-locked) routes are unaffected.
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const bottomItems = BOTTOM_NAV.ACCOUNTANT ?? [];
  const moreItems = MORE_NAV.ACCOUNTANT ?? [];
  const centerItem = CENTER_NAV.ACCOUNTANT;

  return (
    <DesktopShell
      allow={["ACCOUNTANT"]}
      navItems={SIDEBAR_NAV.ACCOUNTANT ?? []}
      hideMobileNavTrigger
      mobileBottomNav={
        <StudentBottomNav items={bottomItems} centerItem={centerItem} moreItems={moreItems} />
      }
    >
      <Outlet />
    </DesktopShell>
  );
}

export const Route = createFileRoute("/_authenticated/accountant")({
  head: () => ({
    meta: [{ title: "Accountant — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountantLayout,
});

