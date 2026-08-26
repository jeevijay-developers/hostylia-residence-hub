import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DesktopShell } from "@/components/dashboard/DesktopShell";
import { SIDEBAR_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Parent — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <DesktopShell allow={["PARENT"]} navItems={SIDEBAR_NAV.PARENT ?? []}>
      <Outlet />
    </DesktopShell>
  ),
});
