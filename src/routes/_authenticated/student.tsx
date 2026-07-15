import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MobileShell } from "@/components/dashboard/MobileShell";
import { BOTTOM_NAV } from "@/lib/dashboard-nav";

export const Route = createFileRoute("/_authenticated/student")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <MobileShell allow={["STUDENT"]} navItems={BOTTOM_NAV.STUDENT ?? []}>
      <Outlet />
    </MobileShell>
  ),
});
