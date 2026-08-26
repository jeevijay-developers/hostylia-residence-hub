import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { SIDEBAR_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <DesktopShell allow={["WARDEN"]} navItems={SIDEBAR_NAV.WARDEN ?? []}>
      <Outlet />
    </DesktopShell>
  ),
});
