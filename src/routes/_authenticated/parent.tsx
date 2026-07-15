import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MobileShell } from "@/components/dashboard/MobileShell";
import { BOTTOM_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Parent — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <MobileShell allow={["PARENT"]} navItems={BOTTOM_NAV.PARENT ?? []}>
      <Outlet />
    </MobileShell>
  ),
});
