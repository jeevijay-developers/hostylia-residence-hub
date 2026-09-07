import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, CENTER_NAV, type NavItem } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: WardenLayout,
});

const NO_MORE_ITEMS: NavItem[] = [];

function WardenLayout() {
  const bottomItems = BOTTOM_NAV.WARDEN ?? [];
  const centerItem = CENTER_NAV.WARDEN;

  return (
    <DesktopShell
      allow={["WARDEN"]}
      navItems={SIDEBAR_NAV.WARDEN ?? []}
      hideMobileNavTrigger
      mobileBottomNav={
        <StudentBottomNav items={bottomItems} centerItem={centerItem} moreItems={NO_MORE_ITEMS} />
      }
    >
      <Outlet />
    </DesktopShell>
  );
}
