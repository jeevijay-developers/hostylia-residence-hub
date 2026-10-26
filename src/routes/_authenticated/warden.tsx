import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, CENTER_NAV, type NavItem } from "@/lib/dashboard-nav";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: WardenLayout,
});

const NO_MORE_ITEMS: NavItem[] = [];

// Finance keys the "Finance" sidebar item's synthetic "finance_any" module
// resolves against — not a real `role_assignments.permissions` entry, just
// "show the Finance nav item if any one of these is granted" (the landing
// page at /warden/finance then filters its own cards per-key).
const FINANCE_ANY_KEYS = ["fee_plans_view", "invoices_view", "payments_view", "refunds"];

function WardenLayout() {
  const { can: canModule } = useWardenPermissions();
  // Same "no module tag = always visible" + "module tag -> gate on the
  // matching PermissionKey" filtering student.tsx already applies, extended
  // to Warden's own custom-permission matrix (admin.staff.tsx). The mobile
  // "More" sheet stays empty — unchanged from before, not part of this fix.
  const moduleFilter = (item: NavItem) => {
    if (!item.module) return true;
    if (item.module === "finance_any") return FINANCE_ANY_KEYS.some((k) => canModule(k));
    return canModule(item.module);
  };
  const navItems = (SIDEBAR_NAV.WARDEN ?? []).filter(moduleFilter);
  const bottomItems = (BOTTOM_NAV.WARDEN ?? []).filter(moduleFilter);
  const rawCenter = CENTER_NAV.WARDEN;
  const centerItem =
    rawCenter && (!rawCenter.module || canModule(rawCenter.module)) ? rawCenter : undefined;

  return (
    <DesktopShell
      allow={["WARDEN"]}
      navItems={navItems}
      hideMobileNavTrigger
      mobileHeaderScrollsWithContent
      mobileBottomNav={
        <StudentBottomNav items={bottomItems} centerItem={centerItem} moreItems={NO_MORE_ITEMS} />
      }
    >
      <Outlet />
    </DesktopShell>
  );
}
