import { createFileRoute } from "@tanstack/react-router";
import { RoleShell } from "@/components/auth/RoleShell";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => <RoleShell role="SUPER_ADMIN" title="Super Admin" />,
});
