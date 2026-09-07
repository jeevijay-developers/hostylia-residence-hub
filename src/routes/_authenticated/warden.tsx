import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { StudentBottomNav } from "@/components/dashboard/StudentBottomNav";
import { SIDEBAR_NAV, BOTTOM_NAV, MORE_NAV, CENTER_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: WardenLayout,
});

function WardenLayout() {
  const bottomItems = BOTTOM_NAV.WARDEN ?? [];
  const moreItems = MORE_NAV.WARDEN ?? [];
  const centerItem = CENTER_NAV.WARDEN;

  return (
    <DesktopShell
      allow={["WARDEN"]}
      navItems={SIDEBAR_NAV.WARDEN ?? []}
      hideMobileNavTrigger
      mobileBottomNav={
        <StudentBottomNav items={bottomItems} centerItem={centerItem} moreItems={moreItems} />
      }
    >
      <Outlet />
    </DesktopShell>
  );
}

