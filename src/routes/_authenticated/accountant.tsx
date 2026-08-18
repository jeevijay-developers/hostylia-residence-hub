import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { SIDEBAR_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/accountant")({
  head: () => ({
    meta: [{ title: "Accountant — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <DesktopShell allow={["ACCOUNTANT"]} navItems={SIDEBAR_NAV.ACCOUNTANT ?? []}>
      <Outlet />
    </DesktopShell>
  ),
});
