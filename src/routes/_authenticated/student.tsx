import { createFileRoute } from "@tanstack/react-router";
import { RoleShell } from "@/components/auth/RoleShell";

export const Route = createFileRoute("/_authenticated/student")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }, { name: "robots", content: "noindex" }] }),
  component: () => <RoleShell role="STUDENT" title="Student" />,
});
