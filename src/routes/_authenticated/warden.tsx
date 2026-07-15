import { createFileRoute } from "@tanstack/react-router";
import { RoleShell } from "@/components/auth/RoleShell";

export const Route = createFileRoute("/_authenticated/warden")({
  head: () => ({ meta: [{ title: "Warden — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => <RoleShell role="WARDEN" title="Warden" />,
});
