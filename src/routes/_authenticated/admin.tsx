import { createFileRoute } from "@tanstack/react-router";
import { RoleShell } from "@/components/auth/RoleShell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => <RoleShell role="HOSTEL_ADMIN / ACCOUNTANT" title="Admin" />,
});
