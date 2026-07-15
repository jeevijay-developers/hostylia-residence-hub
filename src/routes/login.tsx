import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

const loginSearchSchema = z.object({
  mode: z.enum(["phone", "email"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Hostylia" },
      { name: "description", content: "Sign in to your Hostylia account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { mode } = Route.useSearch();
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to Hostylia.">
      <LoginForm defaultMode={mode ?? "phone"} />
    </AuthLayout>
  );
}
