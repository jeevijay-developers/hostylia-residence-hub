import { createFileRoute } from "@tanstack/react-router";
import { RoleShell } from "@/components/auth/RoleShell";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Parent — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => <RoleShell role="PARENT" title="Parent" />,
});
