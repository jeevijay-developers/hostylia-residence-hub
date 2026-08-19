import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { SIDEBAR_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({
    meta: [{ title: "Super Admin — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <DesktopShell allow={["SUPER_ADMIN"]} navItems={SIDEBAR_NAV.SUPER_ADMIN ?? []}>
      <Outlet />
    </DesktopShell>
  ),
});
