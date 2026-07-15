import { createFileRoute } from "@tanstack/react-router";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { RoleRedirect } from "@/components/auth/RoleRedirect";

export const Route = createFileRoute("/post-login")({
  head: () => ({
    meta: [
      { title: "Signing you in — Hostylia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PostLoginPage,
});

function PostLoginPage() {
  return (
    <AuthLayout title="Just a moment" subtitle="Taking you to the right place.">
      <RoleRedirect />
    </AuthLayout>
  );
}
