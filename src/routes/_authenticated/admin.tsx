import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { SIDEBAR_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <DesktopShell
      allow={["HOSTEL_ADMIN"]}
      navItems={SIDEBAR_NAV.HOSTEL_ADMIN ?? []}
      showPropertySwitcher
    >
      <Outlet />
    </DesktopShell>
  ),
});
