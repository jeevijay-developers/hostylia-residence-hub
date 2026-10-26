import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, MORE_NAV, CENTER_NAV, type NavItem } from "@/lib/dashboard-nav";
import { useAccountantPermissions } from "@/lib/staff-scope";

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

  const { can: canModule } = useAccountantPermissions();
  // Same "no module tag = always visible" + "module tag -> gate on the
  // matching PermissionKey" filtering student.tsx/warden.tsx apply, extended
  // to Accountant's own custom-permission matrix (admin.staff.tsx).
  const moduleFilter = (item: NavItem) => !item.module || canModule(item.module);
  const navItems = (SIDEBAR_NAV.ACCOUNTANT ?? []).filter(moduleFilter);
  const bottomItems = (BOTTOM_NAV.ACCOUNTANT ?? []).filter(moduleFilter);
  const moreItems = (MORE_NAV.ACCOUNTANT ?? []).filter(moduleFilter);
  const rawCenter = CENTER_NAV.ACCOUNTANT;
  const centerItem =
    rawCenter && (!rawCenter.module || canModule(rawCenter.module)) ? rawCenter : undefined;

  return (
    <DesktopShell
      allow={["ACCOUNTANT"]}
      navItems={navItems}
      hideMobileNavTrigger
      mobileHeaderScrollsWithContent
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
