import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, CENTER_NAV, type NavItem } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Parent — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: ParentLayout,
});

const NO_MORE_ITEMS: NavItem[] = [];

function ParentLayout() {
  const bottomItems = BOTTOM_NAV.PARENT ?? [];
  const centerItem = CENTER_NAV.PARENT;

  return (
    <DesktopShell
      allow={["PARENT"]}
      navItems={SIDEBAR_NAV.PARENT ?? []}
      hideMobileNavTrigger
      mobileBottomNav={
        <StudentBottomNav items={bottomItems} centerItem={centerItem} moreItems={NO_MORE_ITEMS} />
      }
    >
      <Outlet />
    </DesktopShell>
  );
}
