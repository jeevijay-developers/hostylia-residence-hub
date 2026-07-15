import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MobileShell } from "@/components/dashboard/MobileShell";
import { BOTTOM_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <MobileShell allow={["WARDEN"]} navItems={BOTTOM_NAV.WARDEN ?? []}>
      <Outlet />
    </MobileShell>
  ),
});
